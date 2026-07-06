import { createClient } from '@supabase/supabase-js';

// 1. Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project-id.supabase.co')
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const checkConnection = () => {
  if (!supabase) {
    throw new Error('Supabase belum terkonfigurasi! Harap lengkapi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env.local atau dashboard hosting Anda.');
  }
};

// 2. Data Mappers (snake_case from PostgreSQL to camelCase for React Components)
const mapUser = (u) => {
  if (!u) return null;
  return {
    username: u.username,
    role: u.role,
    displayName: u.display_name,
    location: u.location,
    createdAt: u.created_at
  };
};

const mapOrder = (o) => {
  if (!o) return null;
  return {
    id: o.id,
    branchUsername: o.branch_username,
    branchName: o.branch_name,
    date: o.date,
    requiredDate: o.required_date,
    urgency: o.urgency,
    notes: o.notes,
    status: o.status,
    grandTotal: Number(o.grand_total) || 0,
    items: (o.items || []).map(item => ({
      productId: item.product_id,
      name: item.name,
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 0,
      urgency: item.urgency || 'medium',
      serialNumbers: item.serial_numbers || ''
    }))
  };
};

// 3. Database Operations
export const db = {
  // --- USERS MODULE ---
  getUsers: async () => {
    checkConnection();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) throw new Error(error.message);
    return (data || []).map(mapUser);
  },
  
  login: async (username, password) => {
    checkConnection();
    const cleanUsername = username.trim().toLowerCase();
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', cleanUsername)
      .eq('password', password)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error('Username atau Password salah!');
    }
    
    return mapUser(data);
  },
  
  createBranchUser: async (username, password, displayName, location) => {
    checkConnection();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password ? password.trim() : 'palamana';
    
    if (!cleanUsername || !cleanPassword || !displayName.trim() || !location.trim()) {
      throw new Error('Semua field (Username, Password, Nama Cabang, Lokasi) wajib diisi!');
    }

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          username: cleanUsername,
          password: cleanPassword,
          role: 'cabang',
          display_name: displayName.trim(),
          location: location.trim()
        }
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Username "${cleanUsername}" sudah terdaftar!`);
      }
      throw new Error(error.message);
    }

    return mapUser(data);
  },

  changePassword: async (username, newPassword) => {
    checkConnection();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = newPassword.trim();
    
    if (!cleanPassword) {
      throw new Error('Password baru tidak boleh kosong!');
    }

    const { data, error } = await supabase
      .from('users')
      .update({ password: cleanPassword })
      .eq('username', cleanUsername)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapUser(data);
  },

  updateUser: async (username, displayName, location, password) => {
    checkConnection();
    const cleanUsername = username.trim().toLowerCase();
    const updateData = {
      display_name: displayName.trim(),
      location: location.trim()
    };
    if (password && password.trim()) {
      updateData.password = password.trim();
    }
    
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('username', cleanUsername)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapUser(data);
  },

  deleteUser: async (username) => {
    checkConnection();
    const cleanUsername = username.trim().toLowerCase();
    
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('username', cleanUsername);

    if (error) throw new Error(error.message);
    return true;
  },

  // --- PRODUCTS MODULE ---
  getProducts: async () => {
    checkConnection();
    // Run background migration update queries to keep categories normalized
    try {
      await supabase.from('products').update({ category: 'Adaptor' }).eq('category', 'Adaptor & Charger');
      await supabase.from('products').update({ category: 'Keyboard' }).eq('category', 'Keyboard & Touchpad');
    } catch (e) {
      console.error('Migration error:', e);
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
      
    if (error) throw new Error(error.message);
    return data || [];
  },
  
  createProduct: async (productData) => {
    checkConnection();
    const newProduct = {
      id: `prod-${Date.now()}`,
      name: productData.name.trim(),
      sku: productData.sku.trim().toUpperCase(),
      category: productData.category.trim(),
      price: Number(productData.price) || 0,
      stock: Number(productData.stock) || 0,
      description: productData.description.trim()
    };
    
    if (!newProduct.name || !newProduct.sku || !newProduct.category) {
      throw new Error('Nama, SKU, dan Kategori produk wajib diisi!');
    }

    const { data, error } = await supabase
      .from('products')
      .insert([newProduct])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Produk dengan SKU "${newProduct.sku}" sudah terdaftar!`);
      }
      throw new Error(error.message);
    }
    
    return data;
  },
  
  importProductsFromExcel: async (productsArray) => {
    checkConnection();
    if (!productsArray || productsArray.length === 0) {
      throw new Error('Data excel kosong atau format tidak sesuai!');
    }

    const { data: existing } = await supabase.from('products').select('*');
    const existingList = existing || [];

    const upsertData = productsArray.map((item, idx) => {
      const skuUpper = item.sku.toString().trim().toUpperCase();
      const match = existingList.find(p => p.sku.toUpperCase() === skuUpper);
      return {
        id: match ? match.id : `prod-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        sku: skuUpper,
        name: item.name.toString().trim(),
        category: item.category.toString().trim(),
        price: Number(item.price) || 0,
        stock: Number(item.stock) || 0,
        description: item.description || ''
      };
    });

    const { error } = await supabase
      .from('products')
      .upsert(upsertData, { onConflict: 'sku' });

    if (error) throw new Error(error.message);
    return true;
  },
  
  updateProduct: async (productId, productData) => {
    checkConnection();
    const updated = {
      name: productData.name.trim(),
      sku: productData.sku.trim().toUpperCase(),
      category: productData.category.trim(),
      price: Number(productData.price) || 0,
      stock: Number(productData.stock) || 0,
      description: productData.description.trim()
    };
    
    if (!updated.name || !updated.sku || !updated.category) {
      throw new Error('Nama, SKU, dan Kategori produk wajib diisi!');
    }

    const { data, error } = await supabase
      .from('products')
      .update(updated)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Produk dengan SKU "${updated.sku}" sudah terdaftar!`);
      }
      throw new Error(error.message);
    }
    
    return data;
  },
  
  deleteProduct: async (productId) => {
    checkConnection();
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw new Error(error.message);
    return true;
  },
  
  addProductStock: async (productId, addedQty, serialNumbers) => {
    checkConnection();
    const { data: product, error: getErr } = await supabase
      .from('products')
      .select('stock, description')
      .eq('id', productId)
      .single();
      
    if (getErr) throw new Error(getErr.message);
    
    const newStock = (product.stock || 0) + addedQty;
    
    const currentDesc = product.description || '';
    let cleanDesc = currentDesc;
    let existingSns = [];
    if (currentDesc.includes('||SN:')) {
      const parts = currentDesc.split('||SN:');
      cleanDesc = parts[0].trim();
      existingSns = parts[1].split(', ').map(s => s.trim().toUpperCase()).filter(Boolean);
    }
    
    const newSnsList = Array.isArray(serialNumbers) ? serialNumbers.map(s => s.trim().toUpperCase()) : [];
    const combinedSns = [...existingSns, ...newSnsList];
    const newDesc = cleanDesc + (combinedSns.length > 0 ? ` ||SN: ${combinedSns.join(', ')}` : '');
    
    const { data, error: updateErr } = await supabase
      .from('products')
      .update({ 
        stock: newStock,
        description: newDesc
      })
      .eq('id', productId)
      .select()
      .single();
      
    if (updateErr) throw new Error(updateErr.message);
    return data;
  },

  // --- ORDERS MODULE ---
  getOrders: async () => {
    checkConnection();
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .order('date', { ascending: false });
      
    if (error) throw new Error(error.message);
    return (data || []).map(mapOrder);
  },
  
  createOrder: async (branchUsername, branchName, cartItems, notes, urgency, requiredDate) => {
    checkConnection();
    if (!cartItems || cartItems.length === 0) {
      throw new Error('Daftar orderan kosong! Silakan tambahkan sparepart.');
    }
    
    // Filter out custom items (which start with 'custom-') from catalog verification and stock updates
    const catalogItems = cartItems.filter(item => !item.productId.startsWith('custom-'));

    let dbProducts = [];
    if (catalogItems.length > 0) {
      const { data, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .in('id', catalogItems.map(i => i.productId));

      if (prodErr) throw new Error(prodErr.message);
      dbProducts = data || [];

      catalogItems.forEach((item) => {
        const dbProd = dbProducts.find(p => p.id === item.productId);
        if (!dbProd) {
          throw new Error(`Produk "${item.name}" tidak ditemukan di katalog pusat!`);
        }
      });
    }

    const { data: allOrders, error: ordCountErr } = await supabase
      .from('orders')
      .select('id');
      
    if (ordCountErr) throw new Error(ordCountErr.message);
    const formattedId = `ORD-${String((allOrders || []).length + 1).padStart(3, '0')}`;
    const grandTotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    const newOrder = {
      id: formattedId,
      branch_username: branchUsername,
      branch_name: branchName,
      date: new Date().toISOString(),
      required_date: requiredDate || new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0],
      notes: notes || '',
      status: 'pending',
      grand_total: grandTotal
    };

    const { error: orderErr } = await supabase
      .from('orders')
      .insert([newOrder]);

    if (orderErr) throw new Error(orderErr.message);

    const orderItems = cartItems.map(item => ({
      order_id: formattedId,
      product_id: item.productId,
      name: item.name,
      price: item.price,
      qty: item.qty,
      urgency: item.urgency || 'medium' // Urgency per item
    }));

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsErr) {
      await supabase.from('orders').delete().eq('id', formattedId);
      throw new Error(itemsErr.message);
    }

    // Deduct stock for catalog items only
    for (const item of catalogItems) {
      const dbProd = dbProducts.find(p => p.id === item.productId);
      const newStock = dbProd.stock - item.qty;
      
      await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.productId);
    }

    return mapOrder({ ...newOrder, items: orderItems });
  },
  
  updateOrderStatus: async (orderId, status) => {
    checkConnection();
    
    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (ordErr) throw new Error(ordErr.message);
    if (!order) throw new Error('Pesanan tidak ditemukan!');

    const oldStatus = order.status;
    if (oldStatus === status) return mapOrder(order);

    // If order is approved, clear the temporary 'orig:' in serial_numbers
    if (status === 'approved') {
      for (const item of order.items) {
        if (item.serial_numbers && item.serial_numbers.startsWith('orig:')) {
          const replacement = item.qty > 0 ? null : 'KOSONG';
          await supabase
            .from('order_items')
            .update({ serial_numbers: replacement })
            .eq('order_id', orderId)
            .eq('product_id', item.product_id);
        }
      }
    }

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({ status: status })
      .eq('id', orderId)
      .select('*, items:order_items(*)')
      .single();

    if (updateErr) throw new Error(updateErr.message);

    if (status === 'cancelled' && oldStatus !== 'cancelled') {
      const { data: dbProducts } = await supabase.from('products').select('*');
      if (dbProducts) {
        for (const item of order.items) {
          const prod = dbProducts.find(p => p.id === item.product_id);
          if (prod) {
            await supabase
              .from('products')
              .update({ stock: prod.stock + item.qty })
              .eq('id', item.product_id);
          }
        }
      }
    }
    
    if (oldStatus === 'cancelled' && status !== 'cancelled') {
      const { data: dbProducts } = await supabase.from('products').select('*');
      if (dbProducts) {
        for (const item of order.items) {
          const prod = dbProducts.find(p => p.id === item.product_id);
          if (prod && prod.stock < item.qty) {
            await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
            throw new Error(`Gagal mengaktifkan kembali! Stok "${prod.name}" tidak cukup. Tersedia: ${prod.stock}`);
          }
        }

        for (const item of order.items) {
          const prod = dbProducts.find(p => p.id === item.product_id);
          if (prod) {
            await supabase
              .from('products')
              .update({ stock: prod.stock - item.qty })
              .eq('id', item.product_id);
          }
        }
      }
    }

    return mapOrder(updatedOrder);
  },

  updatePendingOrderItemQty: async (orderId, productId, newQty) => {
    checkConnection();
    
    const { data: item, error: itemErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .eq('product_id', productId)
      .single();
      
    if (itemErr) throw new Error(itemErr.message);
    if (!item) throw new Error('Item pesanan tidak ditemukan!');

    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
      
    if (ordErr) throw new Error(ordErr.message);
    if (order.status !== 'pending') {
      throw new Error('Hanya pesanan berstatus PENDING yang dapat diubah detail itemnya!');
    }

    const currentQty = item.qty;
    const diff = newQty - currentQty;

    let originalQty = currentQty;
    let serialString = item.serial_numbers;
    if (serialString && serialString.startsWith('orig:')) {
      originalQty = parseInt(serialString.replace('orig:', ''), 10);
    } else {
      originalQty = currentQty;
      serialString = `orig:${originalQty}`;
    }

    if (newQty < 0 || newQty > originalQty) {
      throw new Error(`Kuantitas tidak valid! Harus antara 0 dan ${originalQty}`);
    }

    if (!productId.startsWith('custom-')) {
      const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('stock, name')
        .eq('id', productId)
        .single();
        
      if (prodErr) throw new Error(prodErr.message);
      
      if (diff > 0 && prod.stock < diff) {
        throw new Error(`Stok "${prod.name}" tidak mencukupi! Tersedia di katalog: ${prod.stock}`);
      }

      const { error: stockErr } = await supabase
        .from('products')
        .update({ stock: prod.stock - diff })
        .eq('id', productId);
        
      if (stockErr) throw new Error(stockErr.message);
    }

    const { error: updateItemErr } = await supabase
      .from('order_items')
      .update({ qty: newQty, serial_numbers: serialString })
      .eq('order_id', orderId)
      .eq('product_id', productId);
      
    if (updateItemErr) throw new Error(updateItemErr.message);

    const { data: allItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('price, qty')
      .eq('order_id', orderId);
      
    if (itemsErr) throw new Error(itemsErr.message);
    const newGrandTotal = allItems.reduce((sum, it) => sum + (it.price * it.qty), 0);

    const { error: updateOrderErr } = await supabase
      .from('orders')
      .update({ grand_total: newGrandTotal })
      .eq('id', orderId);
      
    if (updateOrderErr) throw new Error(updateOrderErr.message);

    return true;
  },
  
  updateOrderItemSerials: async (orderId, productId, serials) => {
    checkConnection();
    const serialString = Array.isArray(serials) 
      ? serials.filter(s => s.trim()).join(', ') 
      : (serials || '').trim();
    
    const { error } = await supabase
      .from('order_items')
      .update({ serial_numbers: serialString })
      .eq('order_id', orderId)
      .eq('product_id', productId);

    if (error) throw new Error(error.message);

    // Deduct assigned S/Ns from product's description list
    const newSnsList = Array.isArray(serials) 
      ? serials.map(s => s.trim().toUpperCase()) 
      : (serials || '').split(', ').map(s => s.trim().toUpperCase()).filter(Boolean);
    
    if (newSnsList.length > 0 && !productId.startsWith('custom-')) {
      const { data: product } = await supabase
        .from('products')
        .select('description')
        .eq('id', productId)
        .maybeSingle();
        
      if (product) {
        const currentDesc = product.description || '';
        if (currentDesc.includes('||SN:')) {
          const parts = currentDesc.split('||SN:');
          const cleanDesc = parts[0].trim();
          const existingSns = parts[1].split(', ').map(s => s.trim().toUpperCase()).filter(Boolean);
          
          // Remove the ones that are being assigned
          const remainingSns = existingSns.filter(sn => !newSnsList.includes(sn));
          
          const newDesc = cleanDesc + (remainingSns.length > 0 ? ` ||SN: ${remainingSns.join(', ')}` : '');
          
          await supabase
            .from('products')
            .update({ description: newDesc })
            .eq('id', productId);
        }
      }
    }

    return true;
  },

  deleteOrder: async (orderId) => {
    checkConnection();
    
    // 1. Get the order first to check its status and items for stock restoration
    const { data: order, error: getErr } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (getErr) throw new Error(getErr.message);
    if (!order) throw new Error('Pesanan tidak ditemukan!');

    // 2. If status is NOT cancelled, restore stock for catalog items
    if (order.status !== 'cancelled') {
      const { data: dbProducts } = await supabase.from('products').select('*');
      if (dbProducts && order.items) {
        for (const item of order.items) {
          // ignore custom items
          if (!item.product_id.startsWith('custom-')) {
            const prod = dbProducts.find(p => p.id === item.product_id);
            if (prod) {
              await supabase
                .from('products')
                .update({ stock: prod.stock + item.qty })
                .eq('id', item.product_id);
            }
          }
        }
      }
    }

    // 3. Delete order items first to satisfy foreign key constraints
    const { error: itemsErr } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);
      
    if (itemsErr) throw new Error(itemsErr.message);

    // 4. Delete the main order record
    const { error: orderErr } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (orderErr) throw new Error(orderErr.message);
    return true;
  },
  
  // --- BACKUP & RESTORE UTILITY ---
  exportDatabase: async () => {
    checkConnection();
    const { data: users } = await supabase.from('users').select('*');
    const { data: products } = await supabase.from('products').select('*');
    const { data: orders } = await supabase.from('orders').select('*');
    const { data: orderItems } = await supabase.from('order_items').select('*');

    return JSON.stringify({ users, products, orders, orderItems }, null, 2);
  },
  
  importDatabase: async (jsonString) => {
    checkConnection();
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.users && parsed.products && parsed.orders && parsed.orderItems) {
        
        await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('orders').delete().neq('id', 'none');
        await supabase.from('products').delete().neq('id', 'none');
        await supabase.from('users').delete().neq('username', 'none');
        
        if (parsed.users.length > 0) await supabase.from('users').insert(parsed.users);
        if (parsed.products.length > 0) await supabase.from('products').insert(parsed.products);
        if (parsed.orders.length > 0) await supabase.from('orders').insert(parsed.orders);
        if (parsed.orderItems.length > 0) await supabase.from('order_items').insert(parsed.orderItems);

        return true;
      }
      throw new Error('Format database JSON tidak valid!');
    } catch (e) {
      throw new Error('Gagal memproses JSON database: ' + e.message);
    }
  },
  
  resetDatabase: async () => {
    checkConnection();
    
    await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('orders').delete().neq('id', 'none');
    await supabase.from('products').delete().neq('id', 'none');
    await supabase.from('users').delete().neq('username', 'none');

    await supabase.from('users').insert([
      { username: 'admin', password: 'palamana', role: 'superadmin', display_name: 'ELS Pusat (Admin)', location: 'Yogyakarta (Pusat)' },
      { username: 'els.purwokerto', password: 'palamana', role: 'cabang', display_name: 'ELS Purwokerto', location: 'Purwokerto' },
      { username: 'els.bandung', password: 'palamana', role: 'cabang', display_name: 'ELS Bandung', location: 'Bandung' }
    ]);

    await supabase.from('products').insert([
      { id: 'prod-1', name: 'LCD Screen LED 14.0 Slim 30 Pin', sku: 'LCD-140-S30P', category: 'Layar & LCD', price: 550000, stock: 40, description: 'Layar LED laptop 14.0 inch slim connector 30 pin, garansi 1 bulan.' },
      { id: 'prod-2', name: 'Baterai Laptop Asus Vivobook C21N1818', sku: 'BAT-ASU-C21N', category: 'Baterai', price: 320000, stock: 25, description: 'Baterai internal notebook Asus Vivobook Series 7.7V 37Wh.' },
      { id: 'prod-3', name: 'Keyboard Laptop Lenovo Thinkpad T490', sku: 'KBD-LEN-T490', category: 'Keyboard', price: 280000, stock: 15, description: 'Keyboard laptop Lenovo Thinkpad T490/T495 US Layout non-backlight.' },
      { id: 'prod-4', name: 'Charger Adaptor Laptop Acer 19V 3.42A', sku: 'ADP-ACE-19V3', category: 'Adaptor', price: 150000, stock: 50, description: 'Charger laptop Acer 65W connector 5.5mm x 1.7mm original.' },
      { id: 'prod-5', name: 'RAM DDR4 Kingston Fury 8GB 3200MHz Sodimm', sku: 'RAM-D4K-8G32', category: 'RAM', price: 295000, stock: 60, description: 'Memori RAM DDR4 Sodimm kapasitas 8GB speed 3200MHz untuk laptop.' },
      { id: 'prod-6', name: 'SSD NVMe M.2 Samsung 980 500GB', sku: 'SSD-SAM-980N', category: 'Penyimpanan (Storage)', price: 750000, stock: 30, description: 'SSD NVMe PCIe Gen 3.0 x4 M.2 Samsung 980 Read speed 3100MB/s.' },
      { id: 'prod-7', name: 'Kipas Fan Laptop HP Pavilion 14-BF', sku: 'FAN-HPP-14BF', category: 'Kipas & Pendingin', price: 95000, stock: 20, description: 'Kipas pendingin (cooling fan) processor HP Pavilion 14-BF series.' },
      { id: 'prod-8', name: 'Thermal Paste Grizzly Kryonaut 1g', sku: 'TP-GRZ-KRY1G', category: 'Thermal Paste', price: 115000, stock: 80, description: 'Thermal pasta premium Grizzly Kryonaut untuk penghantar panas optimal CPU laptop.' }
    ]);

    await supabase.from('orders').insert([
      { id: 'ORD-001', branch_username: 'els.purwokerto', branch_name: 'ELS Purwokerto', date: '2026-06-30T10:15:30.000Z', required_date: '2026-07-05', urgency: 'medium', notes: 'Mohon dikirim secepatnya karena stok adaptor charger di cabang menipis.', status: 'shipped', grand_total: 5925000 },
      { id: 'ORD-002', branch_username: 'els.bandung', branch_name: 'ELS Bandung', date: '2026-07-01T14:20:00.000Z', required_date: '2026-07-03', urgency: 'high', notes: 'Urgen sekali untuk perbaikan unit customer korporat! Tolong prioritaskan LCD dan baterai.', status: 'approved', grand_total: 2840000 }
    ]);

    await supabase.from('order_items').insert([
      { order_id: 'ORD-001', product_id: 'prod-4', name: 'Charger Adaptor Laptop Acer 19V 3.42A', price: 150000, qty: 10 },
      { order_id: 'ORD-001', product_id: 'prod-5', name: 'RAM DDR4 Kingston Fury 8GB 3200MHz Sodimm', price: 295000, qty: 15 },
      { order_id: 'ORD-002', product_id: 'prod-1', name: 'LCD Screen LED 14.0 Slim 30 Pin', price: 550000, qty: 4 },
      { order_id: 'ORD-002', product_id: 'prod-2', name: 'Baterai Laptop Asus Vivobook C21N1818', price: 320000, qty: 2 }
    ]);

    return true;
  }
};
