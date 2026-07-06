import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../utils/db';

export default function CabangDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('catalog'); // catalog, orders
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]); // Array of { productId, name, price, qty, maxStock }
  const [cartOpen, setCartOpen] = useState(false);

  // Cart Form State
  const [orderNotes, setOrderNotes] = useState('');
  const [requiredDate, setRequiredDate] = useState('');

  // Custom Sparepart Form State
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState('1');

  // Catalog search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Expanded Order tracking state
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Change Password State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Load products and branch orders
  const reloadData = useCallback(async () => {
    if (products.length === 0 || orders.length === 0) {
      setIsLoading(true);
    }
    try {
      const [allProds, allOrders] = await Promise.all([
        db.getProducts(),
        db.getOrders()
      ]);
      setProducts(allProds);
      const branchOrders = allOrders.filter(o => o.branchUsername === user.username);
      setOrders(branchOrders);
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Gagal memuat data: ${e.message}`, type: 'error' }
      }));
    } finally {
      setIsLoading(false);
    }
  }, [user.username, products.length, orders.length]);

  useEffect(() => {
    reloadData();
    
    // Set default required date to 3 days from now
    const threeDaysLater = new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0];
    setRequiredDate(threeDaysLater);
  }, [reloadData]);

  // Format IDR Currency
  const formatIDR = (num) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  };

  // Format Date
  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // --- CART OPERATIONS ---
  const handleAddToCart = (product) => {
    const existingIndex = cart.findIndex((item) => item.productId === product.id);
    const updatedCart = [...cart];

    if (existingIndex > -1) {
      updatedCart[existingIndex].qty += 1;
    } else {
      updatedCart.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: 1,
        maxStock: product.stock,
        sku: product.sku,
        urgency: 'medium'
      });
    }

    setCart(updatedCart);
    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message: `Berhasil menambahkan "${product.name}" ke daftar orderan!`, type: 'success' }
    }));
  };

  const handleUpdateCartQty = (productId, change) => {
    const updatedCart = cart.map((item) => {
      if (item.productId === productId) {
        const newQty = item.qty + change;
        if (newQty <= 0) return null;
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(Boolean); // Remove nulls (items with qty 0)

    setCart(updatedCart);
  };

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const handleUpdateCartItemUrgency = (productId, newUrgency) => {
    const updatedCart = cart.map((item) => {
      if (item.productId === productId) {
        return { ...item, urgency: newUrgency };
      }
      return item;
    });
    setCart(updatedCart);
  };

  const handleAddCustomItem = () => {
    if (!customItemName.trim()) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Nama barang kustom wajib diisi!', type: 'error' }
      }));
      return;
    }

    const price = Number(customItemPrice) || 0;
    const qty = Number(customItemQty) || 1;

    const customProduct = {
      productId: 'custom-' + Date.now(),
      name: '[KUSTOM] ' + customItemName.trim(),
      price: price,
      qty: qty,
      maxStock: 9999,
      sku: 'KUSTOM',
      urgency: 'medium'
    };

    setCart([...cart, customProduct]);
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty('1');

    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message: 'Barang kustom ditambahkan ke orderan!', type: 'success' }
    }));
  };

  // --- CHECKOUT PROCESS ---
  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert('Daftar orderan Anda kosong!');
      return;
    }

    try {
      await db.createOrder(
        user.username,
        user.displayName,
        cart,
        orderNotes,
        'medium', // Default header urgency
        requiredDate
      );

      // Reset cart and fields
      setCart([]);
      setOrderNotes('');
      setCartOpen(false);
      
      // Auto toggle to orders tab to see the pending request
      setActiveTab('orders');
      await reloadData();

      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Pesanan baru berhasil diajukan ke Pusat!', type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  // --- CONFIRM RECEIPT (SHIPPED -> COMPLETED) ---
  const handleConfirmReceived = async (orderId) => {
    if (window.confirm('Apakah Anda yakin barang pesanan ini sudah sampai dan diterima dengan lengkap di cabang?')) {
      try {
        await db.updateOrderStatus(orderId, 'completed');
        await reloadData();
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: `Pesanan ${orderId} telah selesai diterima!`, type: 'success' }
        }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: err.message, type: 'error' }
        }));
      }
    }
  };

  // --- CHANGE PASSWORD HANDLER ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Konfirmasi password tidak cocok!', type: 'error' }
      }));
      return;
    }
    try {
      await db.changePassword(user.username, newPassword);
      setPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Password Anda berhasil diperbarui!', type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  // --- FILTERS COMPUTATION ---
  const filteredProducts = products.filter((product) => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(products.map(p => p.category))];
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  // Status mapping for visual stepper
  const getStatusStepIndex = (status) => {
    switch (status) {
      case 'pending': return 0;
      case 'approved': return 1;
      case 'processing': return 2;
      case 'shipped': return 3;
      case 'completed': return 4;
      default: return -1;
    }
  };

  return (
    <div className="layout-wrapper">
      {isLoading && <div className="top-loading-bar" />}
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/favicon.png" alt="ELS Logo" style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover' }} />
              <div className="sidebar-brand-name">
                {user.displayName.toLowerCase().startsWith('els') 
                  ? user.displayName 
                  : user.displayName.toLowerCase().startsWith('cabang')
                    ? user.displayName.replace(/^cabang\s+/i, 'ELS ')
                    : `ELS ${user.displayName}`}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '50px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '2px'}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              {user.location}
            </div>
          </div>
          
          <nav className="sidebar-menu">
            <button 
              className={`sidebar-item ${activeTab === 'catalog' ? 'active' : ''}`}
              onClick={() => setActiveTab('catalog')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
              Katalog Pemesanan
            </button>
            <button 
              className={`sidebar-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('orders'); reloadData(); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              Lacak Order Cabang
            </button>
          </nav>
        </div>

        <div className="sidebar-user">
          <div className="user-profile-summary">
            <div className="avatar">{user.displayName.substring(4, 5) || 'C'}</div>
            <div className="user-info">
              <span className="user-name">{user.displayName}</span>
              <span className="user-role">Cabang ELS</span>
            </div>
          </div>
          <button 
            onClick={() => setPasswordModalOpen(true)} 
            className="btn btn-secondary btn-sm" 
            style={{ width: '100%', color: '#f5efe6', borderColor: '#3b312b', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
            Ubah Password
          </button>
          <button onClick={onLogout} className="btn btn-secondary btn-sm" style={{ width: '100%', color: '#f5efe6', borderColor: '#3b312b' }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-title-section">
            <h1>
              {activeTab === 'catalog' ? 'Katalog Suku Cadang ELS Pusat' : 'Pelacak Status Order Cabang'}
            </h1>
          </div>
          
          <div className="header-actions">
            {activeTab === 'catalog' && (
              <button 
                onClick={() => setCartOpen(true)} 
                className="btn btn-secondary cart-badge-wrapper"
                style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                <span>Orderan</span>
                {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
              </button>
            )}
          </div>
        </header>

        <div className="content-body">
          
          {/* --- CATALOG VIEW --- */}
          {activeTab === 'catalog' && (
            <div className="fade-in-up">
              {/* Filter controls */}
              <div className="card-table-wrapper" style={{ padding: '16px 24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="search-input-wrapper" style={{ flexGrow: 1, maxWidth: '400px' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Cari sparepart berdasarkan nama atau Kode MASTER..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <select 
                    className="form-input" 
                    style={{ width: '220px', padding: '10px' }}
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="all">Semua Kategori</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* List Layout of Products */}
              <div className="card-table-wrapper">
                <div style={{ overflowX: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>MASTER</th>
                        <th>Nama Suku Cadang</th>
                        <th>Kategori</th>
                        <th>Harga Satuan</th>
                        <th>Stok Pusat</th>
                        <th style={{ width: '200px', textAlign: 'right' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        Array.from({ length: 5 }).map((_, idx) => (
                          <tr key={idx}>
                            <td><div className="skeleton" style={{ width: '80px', height: '16px' }} /></td>
                            <td>
                              <div className="skeleton" style={{ width: '180px', height: '16px', marginBottom: '6px' }} />
                              <div className="skeleton" style={{ width: '220px', height: '12px' }} />
                            </td>
                            <td><div className="skeleton" style={{ width: '100px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '90px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '60px', height: '16px' }} /></td>
                            <td style={{ textAlign: 'right' }}><div className="skeleton" style={{ width: '80px', height: '28px', borderRadius: '4px' }} /></td>
                          </tr>
                        ))
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            Tidak ada suku cadang sparepart yang cocok dengan pencarian Anda.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => {
                          const isOutOfStock = p.stock <= 0;
                          const itemInCart = cart.find(item => item.productId === p.id);
                          const cartQty = itemInCart ? itemInCart.qty : 0;

                          return (
                            <tr key={p.id}>
                              <td style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                {p.sku}
                              </td>
                              <td>
                                <div style={{ fontWeight: '700' }}>{p.name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {(() => {
                                    const desc = p.description || '';
                                    const cleanDesc = desc.includes('||SN:') ? desc.split('||SN:')[0].trim() : desc;
                                    return cleanDesc || 'Tidak ada deskripsi tambahan.';
                                  })()}
                                </div>
                              </td>
                              <td>
                                <span 
                                  style={{ 
                                    padding: '4px 8px', 
                                    backgroundColor: 'var(--bg-app)', 
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 600
                                  }}
                                >
                                  {p.category}
                                </span>
                              </td>
                              <td style={{ fontWeight: '700', color: 'var(--primary)' }}>
                                {formatIDR(p.price)}
                              </td>
                              <td>
                                <span 
                                  style={{ 
                                    fontWeight: '700', 
                                    color: isOutOfStock ? 'var(--status-cancelled)' : p.stock < 15 ? 'var(--status-pending)' : 'var(--status-completed)' 
                                  }}
                                >
                                  {p.stock} pcs
                                </span>
                                {isOutOfStock && <span style={{fontSize:'10px', display:'block', color:'var(--status-cancelled)'}}>Habis!</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                                  {cartQty > 0 ? (
                                    <div className="quantity-selector" style={{ display: 'inline-flex', padding: '2px', backgroundColor: 'var(--border-color)', borderRadius: '6px' }}>
                                      <button 
                                        type="button" 
                                        className="quantity-btn"
                                        onClick={() => handleUpdateCartQty(p.id, -1)}
                                        style={{ width: '26px', height: '26px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', padding: 0 }}
                                      >
                                        -
                                      </button>
                                      <span className="quantity-val" style={{ width: '28px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--text-color)', lineHeight: '26px' }}>
                                        {cartQty}
                                      </span>
                                      <button 
                                        type="button" 
                                        className="quantity-btn"
                                        onClick={() => handleUpdateCartQty(p.id, 1)}
                                        style={{ width: '26px', height: '26px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', padding: 0 }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => handleAddToCart(p)}
                                      className="btn btn-primary btn-sm"
                                      style={{ 
                                        padding: '8px 14px',
                                        fontSize: '12px',
                                      }}
                                    >
                                      Tambah +
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- ORDER LAUNCH TRACKER VIEW --- */}
          {activeTab === 'orders' && (
            <div className="card-table-wrapper fade-in-up">
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="section-title">Riwayat Pesanan Cabang Anda</h3>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Total pengajuan: <strong>{orders.length} pesanan</strong>
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>ID Order</th>
                      <th>Tanggal Pemesanan</th>
                      <th>Diminta Sampai</th>
                      <th>Total Biaya</th>
                      <th>Status Pesanan</th>
                      <th style={{ width: '150px', textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const isExpanded = expandedOrderId === order.id;
                      const stepIndex = getStatusStepIndex(order.status);
                      
                      return (
                        <React.Fragment key={order.id}>
                          <tr 
                            onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            style={{ cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                          >
                            <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{order.id}</td>
                            <td>{formatDate(order.date)}</td>
                            <td><span style={{ fontWeight: 500 }}>{order.requiredDate}</span></td>
                            <td style={{ fontWeight: '800' }}>{formatIDR(order.grandTotal)}</td>
                            <td>
                              <span className={`badge badge-${order.status}`}>{order.status}</span>
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                {order.status === 'shipped' && (
                                  <button 
                                    onClick={() => handleConfirmReceived(order.id)}
                                    className="btn btn-primary btn-sm"
                                    style={{ padding: '6px 12px', fontSize: '11px', background: 'var(--status-completed)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    Diterima
                                  </button>
                                )}
                                <button 
                                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                >
                                  {isExpanded ? 'Tutup ▲' : 'Lacak ▼'}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expansion Row with progress bar / item breakdown */}
                          {isExpanded && (
                            <tr>
                              <td colSpan="6" style={{ padding: 0, backgroundColor: 'var(--bg-app)' }}>
                                <div className="order-details-expanded" style={{ textAlign: 'left' }}>
                                  
                                  {/* Progress bar (Stepper) */}
                                  {order.status === 'cancelled' ? (
                                    <div 
                                      style={{ 
                                        backgroundColor: 'var(--status-cancelled-bg)', 
                                        color: 'var(--status-cancelled)', 
                                        padding: '16px', 
                                        borderRadius: '8px', 
                                        marginBottom: '24px',
                                        fontWeight: 600,
                                        border: '1px solid rgba(220, 38, 38, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                      }}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                      <span>PESANAN DIBATALKAN PUSAT. Stok spareparts telah dikembalikan ke inventory pusat. Silakan ajukan pesanan baru jika dibutuhkan.</span>
                                    </div>
                                  ) : (
                                    <div style={{ marginBottom: '32px' }}>
                                      <h4 className="expanded-section-title">Pelacakan Logistik Pesanan</h4>
                                      <div className="stepper-wrapper">
                                        <div className="stepper-progress-bar">
                                          <div 
                                            className="stepper-progress-fill" 
                                            style={{ width: `${(stepIndex / 4) * 100}%` }}
                                          />
                                        </div>
                                        
                                        <div className={`step-node ${stepIndex >= 0 ? (stepIndex === 0 ? 'active' : 'completed') : ''}`}>
                                          <div className="step-icon">1</div>
                                          <span className="step-label">Diajukan</span>
                                        </div>
                                        <div className={`step-node ${stepIndex >= 1 ? (stepIndex === 1 ? 'active' : 'completed') : ''}`}>
                                          <div className="step-icon">2</div>
                                          <span className="step-label">Disetujui</span>
                                        </div>
                                        <div className={`step-node ${stepIndex >= 2 ? (stepIndex === 2 ? 'active' : 'completed') : ''}`}>
                                          <div className="step-icon">3</div>
                                          <span className="step-label">Diproses</span>
                                        </div>
                                        <div className={`step-node ${stepIndex >= 3 ? (stepIndex === 3 ? 'active' : 'completed') : ''}`}>
                                          <div className="step-icon">4</div>
                                          <span className="step-label">Dikirim</span>
                                        </div>
                                        <div className={`step-node ${stepIndex >= 4 ? (stepIndex === 4 ? 'active' : 'completed') : ''}`}>
                                          <div className="step-icon">5</div>
                                          <span className="step-label">Selesai</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Grid Details */}
                                  <div className="order-expanded-grid">
                                    {/* Item list */}
                                    <div>
                                      <h4 className="expanded-section-title">Rincian Barang</h4>
                                      <div className="expanded-item-list">
                                        {order.items.map((item, index) => {
                                          const isItemCancelled = item.qty === 0 || item.serialNumbers === 'KOSONG';
                                          return (
                                            <div 
                                              key={index}
                                              className="expanded-item"
                                              style={{ 
                                                padding: '10px 14px', 
                                                backgroundColor: 'var(--bg-card)', 
                                                borderRadius: '6px', 
                                                border: '1px solid var(--border-color)',
                                                marginBottom: '6px',
                                                opacity: isItemCancelled ? 0.6 : 1
                                              }}
                                            >
                                              <div>
                                                <span style={{ 
                                                  fontWeight: '600',
                                                  textDecoration: isItemCancelled ? 'line-through' : 'none',
                                                  color: isItemCancelled ? 'var(--text-muted)' : 'var(--text-main)'
                                                }}>
                                                  {item.name}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {formatIDR(item.price)} x {item.qty} pcs
                                                  </span>
                                                  <span className={`badge badge-urgency ${item.urgency || 'medium'}`} style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center' }}>
                                                    <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.urgency === 'high' ? 'var(--status-cancelled)' : item.urgency === 'low' ? 'var(--status-completed)' : 'rgb(245, 158, 11)', marginRight: '6px'}} />
                                                    {item.urgency === 'high' ? 'Urgen' : item.urgency === 'low' ? 'Biasa' : 'Sedang'}
                                                  </span>
                                                  {isItemCancelled && (
                                                    <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled)', fontWeight: '600', display: 'inline-flex', alignItems: 'center' }}>
                                                      <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-cancelled)', marginRight: '6px'}} />
                                                      Kosong (Dibatalkan oleh Pusat)
                                                    </span>
                                                  )}
                                                </div>
                                                {item.serialNumbers && !isItemCancelled && (
                                                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                                    <span>S/N:</span>
                                                    <span style={{ backgroundColor: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px' }}>{item.serialNumbers}</span>
                                                  </div>
                                                )}
                                              </div>
                                              <div style={{ fontWeight: '700', alignSelf: 'center', color: isItemCancelled ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                                {formatIDR(item.price * item.qty)}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', marginTop: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '6px', fontWeight: '800' }}>
                                        <span>Subtotal Biaya:</span>
                                        <span style={{ color: 'var(--primary)' }}>{formatIDR(order.grandTotal)}</span>
                                      </div>
                                    </div>

                                    {/* Order Info & notes */}
                                    <div>
                                      <h4 className="expanded-section-title">Detail Pengiriman & Catatan</h4>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-muted)' }}>Status Terkini: </span>
                                          <strong className={`badge badge-${order.status}`} style={{ fontSize: '11px' }}>{order.status.toUpperCase()}</strong>
                                        </div>
                                        <div>
                                          <span style={{ color: 'var(--text-muted)' }}>Tingkat Prioritas: </span>
                                          <strong>Ditentukan per-item di kiri</strong>
                                        </div>
                                        <div>
                                          <span style={{ color: 'var(--text-muted)' }}>Estimasi Batas Sampai: </span>
                                          <strong>{order.requiredDate}</strong>
                                        </div>
                                        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                          <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Catatan Anda:</span>
                                          <div style={{ fontStyle: 'italic', padding: '8px', backgroundColor: 'var(--bg-app)', borderRadius: '4px', borderLeft: '3px solid var(--accent)' }}>
                                            {order.notes || 'Tidak ada catatan.'}
                                          </div>
                                        </div>

                                        {order.status === 'shipped' && (
                                          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                                            <p style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>Barang sudah sampai? Mohon konfirmasi penerimaan:</p>
                                            <button 
                                              onClick={() => handleConfirmReceived(order.id)}
                                              className="btn btn-primary"
                                              style={{ width: '100%', padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                              Konfirmasi Barang Telah Sampai
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {orders.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          Anda belum pernah mengajukan order sparepart. Silakan pilih suku cadang di menu Katalog.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- CART DRAWER POPUP --- */}
          <div className={`cart-drawer-backdrop ${cartOpen ? 'active' : ''}`} onClick={() => setCartOpen(false)}>
            <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="cart-header">
                <h3 className="cart-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                  Daftar Orderan Cabang
                </h3>
                <button onClick={() => setCartOpen(false)} className="close-btn">✕</button>
              </div>

              {/* Items List */}
              <div className="cart-items">
                {cart.map((item) => (
                  <div key={item.productId} className="cart-item">
                    <div className="cart-item-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </div>
                    <div className="cart-item-details" style={{ textAlign: 'left' }}>
                      <div className="cart-item-name">{item.name}</div>
                      <div className="cart-item-price">{formatIDR(item.price)}</div>
                      
                      <div className="cart-item-controls">
                        <div className="quantity-selector">
                          <button 
                            type="button" 
                            className="quantity-btn"
                            onClick={() => handleUpdateCartQty(item.productId, -1)}
                          >
                            -
                          </button>
                          <span className="quantity-val">{item.qty}</span>
                          <button 
                            type="button" 
                            className="quantity-btn"
                            onClick={() => handleUpdateCartQty(item.productId, 1)}
                          >
                            +
                          </button>
                        </div>

                        <button 
                          onClick={() => handleRemoveFromCart(item.productId)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', color: 'var(--status-cancelled)', border: 'none' }}
                        >
                          Hapus
                        </button>

                        <select
                          value={item.urgency || 'medium'}
                          onChange={(e) => handleUpdateCartItemUrgency(item.productId, e.target.value)}
                          className="form-input"
                          style={{ fontSize: '11px', padding: '2px 6px', height: '26px', width: '85px', border: '1px solid var(--border-color)', borderRadius: '4px', minWidth: 'auto', marginLeft: '8px' }}
                        >
                          <option value="low">Biasa</option>
                          <option value="medium">Sedang</option>
                          <option value="high">Urgen</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {cart.length === 0 && (
                  <div className="cart-empty">
                    <span className="cart-empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    </span>
                    <p>Orderan kosong.</p>
                    <p style={{ fontSize: '13px' }}>Pilih produk suku cadang di katalog dan ajukan pesanan.</p>
                  </div>
                )}

                {/* Custom Item Request Section inside Cart */}
                {(() => {
                  return (
                  <div style={{ padding: '16px', margin: '16px', border: '1px dashed var(--primary)', borderRadius: '8px', backgroundColor: 'var(--bg-app)' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      Request Suku Cadang Kustom
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input 
                        type="text"
                        className="form-input"
                        style={{ fontSize: '12px', padding: '6px' }}
                        placeholder="Nama barang kustom..."
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                      />
                      <div className="custom-item-inputs">
                        <input 
                          type="number"
                          className="form-input"
                          style={{ fontSize: '12px', padding: '6px' }}
                          placeholder="Est. Harga (Rp)"
                          value={customItemPrice}
                          onChange={(e) => setCustomItemPrice(e.target.value)}
                        />
                        <input 
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ fontSize: '12px', padding: '6px' }}
                          placeholder="Qty"
                          value={customItemQty}
                          onChange={(e) => setCustomItemQty(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCustomItem}
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%', fontSize: '11px', padding: '6px', borderStyle: 'solid' }}
                      >
                        Tambah ke Daftar Order
                      </button>
                    </div>
                  </div>
                );
              })()}
              </div>

              {/* Checkout Form & totals */}
              {cart.length > 0 && (
                <form onSubmit={handleCheckout} className="cart-footer" style={{ textAlign: 'left' }}>
                  <div className="form-group">
                    <label className="form-label">Tanggal Dibutuhkan di Cabang</label>
                    <input 
                      type="date"
                      required
                      className="form-input"
                      value={requiredDate}
                      onChange={(e) => setRequiredDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Catatan Tambahan (Spesifikasi Unit / Keterangan)</label>
                    <textarea 
                      className="form-input"
                      rows="2"
                      style={{ resize: 'vertical' }}
                      placeholder="Contoh: Aki mohon diisi air zuur terlebih dahulu, atau untuk Unit Truk plat R..."
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                    />
                  </div>

                  <div className="cart-total-row grand-total">
                    <span>Estimasi Total:</span>
                    <span style={{ color: 'var(--primary)' }}>{formatIDR(cartTotal)}</span>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    Ajukan Order ke Pusat ELS
                  </button>
                </form>
              )}
            </div>
          </div>

        </div>

        {/* Change Password Modal */}
        {passwordModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <h3 className="section-title">Ubah Password Akun</h3>
                <button onClick={() => { setPasswordModalOpen(false); setNewPassword(''); setConfirmPassword(''); }} className="close-btn">✕</button>
              </div>
              <form onSubmit={handleChangePassword}>
                <div className="modal-body" style={{ textAlign: 'left' }}>
                  <div className="form-group">
                    <label className="form-label">Password Baru</label>
                    <input 
                      type="password"
                      required
                      className="form-input"
                      placeholder="Masukkan password baru"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Konfirmasi Password Baru</label>
                    <input 
                      type="password"
                      required
                      className="form-input"
                      placeholder="Ulangi password baru"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" onClick={() => { setPasswordModalOpen(false); setNewPassword(''); setConfirmPassword(''); }} className="btn btn-secondary">Batal</button>
                  <button type="submit" className="btn btn-primary">Simpan Password</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
