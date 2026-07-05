import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../utils/db';
import { getCategorySnInfo } from '../utils/snHelpers';
import * as XLSX from 'xlsx';

const Code39Map = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '000110100', '.': '110000100', ' ': '011000100', '*': '001101000',
  '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010'
};

const generateCode39SVG = (text) => {
  const cleanText = `*${text.toUpperCase()}*`;
  const narrowWidth = 1;
  const wideWidth = 3;
  const gapWidth = 1;
  let x = 0;
  let rects = [];

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const pattern = Code39Map[char] || Code39Map['*'];
    
    for (let j = 0; j < 9; j++) {
      const isBar = j % 2 === 0;
      const isWide = pattern[j] === '1';
      const width = isWide ? wideWidth : narrowWidth;
      
      if (isBar) {
        rects.push(`<rect x="${x}" y="0" width="${width}" height="40" fill="black" />`);
      }
      x += width;
    }
    x += gapWidth;
  }

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 40" width="100%" height="100%" preserveAspectRatio="none">${rects.join('')}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
};

export default function SuperadminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('orders'); // tabs: overview, orders, products, branches, backup
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Search & Filters state
  const [orderSearch, setOrderSearch] = useState('');
  const [orderBranchFilter, setOrderBranchFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  // Product CRUD Modal/Form state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', sku: '', category: '', price: '', stock: '', description: '' });
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');

  // Branch creation form state
  const [branchForm, setBranchForm] = useState({ username: '', password: '', displayName: '', location: '' });
  
  // Edit Branch state
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchModalOpen, setBranchModalOpen] = useState(false);

  // Backup file upload state
  const [backupFileContent, setBackupFileContent] = useState('');

  // Serial number editing list and inputs
  const [serialInputLists, setSerialInputLists] = useState({}); // key: 'orderId-productId', value: Array of S/Ns
  const [snInputs, setSnInputs] = useState({}); // key: 'orderId-productId', value: typed-text
  const [isLoading, setIsLoading] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState(null);

  // Sticker printing states
  const [stickerModalOpen, setStickerModalOpen] = useState(false);
  const [stickersToPrint, setStickersToPrint] = useState([]); // Array of { sku, name, sn }
  const [selectedCatalogSns, setSelectedCatalogSns] = useState({}); // key: productId, value: Array of S/Ns
  const [printSettings, setPrintSettings] = useState({
    paperWidth: 40,
    paperHeight: 20,
    width: 40,
    height: 20,
    columns: 1,
    rows: 1,
    margin: 0,
    fontSize: 8,
    showBarcode: true,
    showProductInfo: true
  });

  // Input Sparepart tab states
  const [inputSubTab, setInputSubTab] = useState('existing'); // 'existing' or 'new'
  const [selectedProductId, setSelectedProductId] = useState('');
  const [newProductForm, setNewProductForm] = useState({
    sku: '',
    name: '',
    category: '',
    customCategory: '',
    price: '',
    description: ''
  });
  const [inputSerialNumbers, setInputSerialNumbers] = useState([]);
  const [manualSnInput, setManualSnInput] = useState('');
  
  // S/N Generator states
  const [generateQty, setGenerateQty] = useState(1);
  const [generateBrand, setGenerateBrand] = useState('ASUS');
  const [generateCustomBrand, setGenerateCustomBrand] = useState('');
  const [generateDate, setGenerateDate] = useState(new Date().toISOString().split('T')[0]);
  const [generateStartNum, setGenerateStartNum] = useState(1);

  // Load database on mount and whenever db changes locally
  const reloadData = useCallback(async () => {
    if (products.length === 0 || orders.length === 0) {
      setIsLoading(true);
    }
    try {
      const [o, p, u] = await Promise.all([
        db.getOrders(),
        db.getProducts(),
        db.getUsers()
      ]);
      setOrders(o);
      setProducts(p);
      setUsers(u);
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Gagal memuat data: ${e.message}`, type: 'error' }
      }));
    } finally {
      setIsLoading(false);
    }
  }, [products.length, orders.length]);

  useEffect(() => {
    reloadData();
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

  // --- ORDER HANDLERS ---
  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await db.updateOrderStatus(orderId, newStatus);
      await reloadData();
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Status pesanan ${orderId} diubah menjadi ${newStatus.toUpperCase()}`, type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus pesanan "${orderId}" secara permanen? Tindakan ini tidak dapat dibatalkan, dan stok barang akan otomatis dikembalikan (jika pesanan belum dibatalkan).`)) {
      return;
    }
    
    try {
      await db.deleteOrder(orderId);
      
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Pesanan "${orderId}" berhasil dihapus!`, type: 'success' }
      }));
      
      await reloadData();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Gagal menghapus pesanan: ${err.message}`, type: 'error' }
      }));
    }
  };

  const handleUpdatePendingItemQty = async (orderId, productId, newQty) => {
    try {
      await db.updatePendingOrderItemQty(orderId, productId, newQty);
      await reloadData();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  const toggleExpandOrder = (id) => {
    setExpandedOrderId(expandedOrderId === id ? null : id);
  };

  // --- PRODUCT CRUD HANDLERS ---
  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductForm({ name: '', sku: '', category: '', price: '', stock: '', description: '' });
    setProductModalOpen(true);
  };

  const openEditProductModal = (product) => {
    setEditingProduct(product);
    const desc = product.description || '';
    const cleanDesc = desc.includes('||SN:') ? desc.split('||SN:')[0].trim() : desc;
    setProductForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price,
      stock: product.stock,
      description: cleanDesc
    });
    setProductModalOpen(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        const currentDesc = editingProduct.description || '';
        const snSuffix = currentDesc.includes('||SN:') ? ' ||SN: ' + currentDesc.split('||SN:')[1].trim() : '';
        const updatedForm = {
          ...productForm,
          description: productForm.description.trim() + snSuffix
        };
        await db.updateProduct(editingProduct.id, updatedForm);
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Produk berhasil diperbarui!', type: 'success' }
        }));
      } else {
        await db.createProduct(productForm);
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Produk baru berhasil ditambahkan!', type: 'success' }
        }));
      }
      setProductModalOpen(false);
      await reloadData();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          throw new Error('File excel kosong!');
        }

        // Map columns (support Indonesian & English)
        const productsArray = rows.map(row => {
          const sku = (row['MASTER'] || row['sku'] || '').toString().trim();
          const name = (row['NAMA SUKU CADANG'] || row['NAMA'] || row['name'] || '').toString().trim();
          const category = (row['KATEGORI'] || row['category'] || 'Kelistrikan').toString().trim();
          const price = Number(row['HARGA'] || row['price']) || 0;
          const stock = Number(row['STOK'] || row['stock']) || 0;
          const description = (row['DESKRIPSI'] || row['description'] || '').toString().trim();

          return { sku, name, category, price, stock, description };
        }).filter(item => item.sku && item.name);

        if (productsArray.length === 0) {
          throw new Error('Tidak ada baris data valid yang memiliki kolom MASTER dan NAMA SUKU CADANG!');
        }

        if (window.confirm(`Ditemukan ${productsArray.length} data produk di file excel. Apakah Anda yakin ingin mengimpor data ini ke database pusat? SKU yang sama akan di-update harganya dan stoknya akan disesuaikan.`)) {
          await db.importProductsFromExcel(productsArray);
          await reloadData();
          window.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: `Sukses mengimpor ${productsArray.length} sparepart dari Excel!`, type: 'success' }
          }));
        }
      } catch (err) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: `Gagal impor excel: ${err.message}`, type: 'error' }
        }));
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input value
    e.target.value = null;
  };

  const handleDeleteProduct = async (productId, productName) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus produk "${productName}" dari katalog?`)) {
      try {
        await db.deleteProduct(productId);
        await reloadData();
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Produk berhasil dihapus!', type: 'success' }
        }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: err.message, type: 'error' }
        }));
      }
    }
  };

  // --- BRANCH HANDLERS ---
  const handleBranchSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!branchForm.username.trim() || !branchForm.password.trim()) {
        throw new Error('Username dan Password cabang wajib diisi!');
      }
      await db.createBranchUser(
        branchForm.username,
        branchForm.password,
        branchForm.displayName,
        branchForm.location
      );
      setBranchForm({ username: '', password: '', displayName: '', location: '' });
      await reloadData();
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Akun cabang baru berhasil didaftarkan!', type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  const handleEditBranchClick = (branch) => {
    setEditingBranch(branch);
    setBranchForm({
      username: branch.username,
      password: '', // Leave empty to not change password by default
      displayName: branch.displayName,
      location: branch.location
    });
    setBranchModalOpen(true);
  };

  const handleEditBranchSubmit = async (e) => {
    e.preventDefault();
    try {
      await db.updateUser(
        editingBranch.username,
        branchForm.displayName,
        branchForm.location,
        branchForm.password
      );
      setBranchModalOpen(false);
      setEditingBranch(null);
      setBranchForm({ username: '', password: '', displayName: '', location: '' });
      await reloadData();
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Akun cabang berhasil diperbarui!', type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  const handleDeleteBranchClick = async (username) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus akun cabang "${username}"? Seluruh riwayat transaksi pesanan cabang ini juga akan dihapus secara permanen.`)) {
      try {
        await db.deleteUser(username);
        await reloadData();
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Akun cabang berhasil dihapus!', type: 'success' }
        }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: err.message, type: 'error' }
        }));
      }
    }
  };

  const handleAddSN = (orderId, productId, maxQty, typedValue) => {
    const key = `${orderId}-${productId}`;
    const currentList = serialInputLists[key] !== undefined 
      ? serialInputLists[key] 
      : (orders.find(o => o.id === orderId)?.items.find(it => it.productId === productId)?.serialNumbers?.split(', ').filter(Boolean) || []);

    const cleanVal = typedValue.trim();
    if (!cleanVal) return;

    // 1. Check for duplicates in the current item's scanned list
    if (currentList.map(s => s.toLowerCase()).includes(cleanVal.toLowerCase())) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Gagal! Serial number "${cleanVal}" sudah di-scan untuk barang ini.`, type: 'error' }
      }));
      return;
    }

    // 2. Check for duplicates across other items in this order
    const orderObj = orders.find(o => o.id === orderId);
    if (orderObj) {
      let duplicateFound = false;
      orderObj.items.forEach(it => {
        if (it.productId !== productId) {
          const otherKey = `${orderId}-${it.productId}`;
          const otherList = serialInputLists[otherKey] !== undefined
            ? serialInputLists[otherKey]
            : (it.serialNumbers ? it.serialNumbers.split(', ').filter(Boolean) : []);
          
          if (otherList.map(s => s.toLowerCase()).includes(cleanVal.toLowerCase())) {
            duplicateFound = true;
          }
        }
      });

      if (duplicateFound) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: `Gagal! Serial number "${cleanVal}" sudah di-scan pada item lain di pesanan ini.`, type: 'error' }
        }));
        return;
      }
    }

    if (currentList.length >= maxQty) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Gagal! Jumlah unit sudah mencapai batas (${maxQty} pcs).`, type: 'error' }
      }));
      return;
    }

    const updatedList = [...currentList, cleanVal];
    setSerialInputLists({
      ...serialInputLists,
      [key]: updatedList
    });
    
    // Clear the input field
    setSnInputs({
      ...snInputs,
      [key]: ''
    });
  };

  const handleDeleteSN = (orderId, productId, idx) => {
    const key = `${orderId}-${productId}`;
    const currentList = serialInputLists[key] !== undefined 
      ? serialInputLists[key] 
      : (orders.find(o => o.id === orderId)?.items.find(it => it.productId === productId)?.serialNumbers?.split(', ').filter(Boolean) || []);

    const updatedList = currentList.filter((_, i) => i !== idx);
    setSerialInputLists({
      ...serialInputLists,
      [key]: updatedList
    });
  };

  const handleSaveSNList = async (orderId, productId) => {
    try {
      const key = `${orderId}-${productId}`;
      const listToSave = serialInputLists[key] !== undefined 
        ? serialInputLists[key] 
        : (orders.find(o => o.id === orderId)?.items.find(it => it.productId === productId)?.serialNumbers?.split(', ').filter(Boolean) || []);

      const itemObj = orders.find(o => o.id === orderId)?.items.find(it => it.productId === productId);
      const targetQty = itemObj ? itemObj.qty : 0;
      const slicedList = listToSave.slice(0, targetQty);

      await db.updateOrderItemSerials(orderId, productId, slicedList);
      await reloadData();
      
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Serial number berhasil disimpan!', type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  // --- INPUT SPAREPART HANDLERS ---
  // Auto detect next serial number sequence start number
  useEffect(() => {
    const getNextSerialNumberStart = () => {
      // 1. Determine Category Code
      let categoryCode = 'GEN';
      let isLcdOrLed = false;
      let categoryName = '';

      if (inputSubTab === 'existing') {
        const selectedProduct = products.find(p => p.id === selectedProductId);
        if (!selectedProduct) return 1;
        categoryName = selectedProduct.category || '';
      } else {
        categoryName = newProductForm.category === 'custom'
          ? (newProductForm.customCategory || '')
          : (newProductForm.category || '');
      }

      const categoryInfo = getCategorySnInfo(categoryName);
      categoryCode = categoryInfo.categoryCode;
      isLcdOrLed = categoryInfo.isLcdOrLed;

      // 2. Determine Brand Code
      let brandCode = '';
      if (!isLcdOrLed) {
        const brandSelect = generateBrand;
        if (brandSelect === 'CUSTOM') {
          brandCode = (generateCustomBrand.trim().toUpperCase() || 'XX').substring(0, 2).padEnd(2, 'X');
        } else {
          const brandMap = {
            'ASUS': 'AS',
            'ACER': 'AC',
            'HP': 'HP',
            'DELL': 'DE',
            'LENOVO': 'LE'
          };
          brandCode = brandMap[brandSelect] || 'XX';
        }
      }

      // 3. Determine Date Code (YYMMDD)
      let dateCode = '260601';
      if (generateDate) {
        const parts = generateDate.split('-');
        if (parts.length === 3) {
          const yy = parts[0].substring(2, 4);
          const mm = parts[1];
          const dd = parts[2];
          dateCode = `${yy}${mm}${dd}`;
        }
      }

      // Prefix pattern we are looking for
      const prefix = isLcdOrLed ? `${categoryCode}-${dateCode}` : `${categoryCode}-${brandCode}-${dateCode}`;

      // Collect all S/Ns from central catalog products (description) and order_items in orders
      const allSns = [];

      // Parse from products.description
      products.forEach(p => {
        if (p.description && p.description.includes('||SN:')) {
          const sns = p.description.split('||SN:')[1].split(', ').map(s => s.trim().toUpperCase()).filter(Boolean);
          allSns.push(...sns);
        }
      });

      // Parse from order_items.serial_numbers
      orders.forEach(order => {
        if (order.items) {
          order.items.forEach(item => {
            if (item.serialNumbers) {
              const sns = item.serialNumbers.split(', ').map(s => s.trim().toUpperCase()).filter(Boolean);
              allSns.push(...sns);
            }
          });
        }
      });

      // Also parse from current session list in input list (uncommitted yet)
      allSns.push(...inputSerialNumbers.map(s => s.toUpperCase()));

      // Filter S/Ns starting with prefix
      const matchingSns = allSns.filter(sn => sn.startsWith(prefix));

      if (matchingSns.length === 0) {
        return 1;
      }

      // Extract NNN suffix (last 3 chars)
      let maxVal = 0;
      matchingSns.forEach(sn => {
        const suffix = sn.substring(prefix.length);
        const parsed = parseInt(suffix, 10);
        if (!isNaN(parsed) && parsed > maxVal) {
          maxVal = parsed;
        }
      });

      return maxVal + 1;
    };

    if (activeTab === 'input_sparepart') {
      const nextNum = getNextSerialNumberStart();
      setGenerateStartNum(nextNum);
    }
  }, [
    activeTab,
    inputSubTab,
    selectedProductId,
    newProductForm.category,
    newProductForm.customCategory,
    generateBrand,
    generateCustomBrand,
    generateDate,
    products,
    orders,
    inputSerialNumbers
  ]);

  // Auto-detect brand from selected product info for existing items
  useEffect(() => {
    if (inputSubTab === 'existing' && selectedProductId && products.length > 0) {
      const selectedProd = products.find(p => p.id === selectedProductId);
      if (selectedProd) {
        const targetString = `${selectedProd.sku} ${selectedProd.name}`.toUpperCase();
        if (targetString.includes('ASUS')) {
          setGenerateBrand('ASUS');
        } else if (targetString.includes('ACER')) {
          setGenerateBrand('ACER');
        } else if (targetString.includes('HP')) {
          setGenerateBrand('HP');
        } else if (targetString.includes('DELL')) {
          setGenerateBrand('DELL');
        } else if (targetString.includes('LENOVO')) {
          setGenerateBrand('LENOVO');
        }
      }
    }
  }, [selectedProductId, inputSubTab, products]);

  const handleGenerateSNs = () => {
    if (generateQty <= 0) {
      alert('Jumlah barang harus lebih besar dari 0!');
      return;
    }

    // 1. Determine Category Code
    let categoryCode = 'GEN';
    let isLcdOrLed = false;
    let categoryName = '';

    if (inputSubTab === 'existing') {
      const selectedProduct = products.find(p => p.id === selectedProductId);
      if (selectedProduct) {
        categoryName = selectedProduct.category || '';
      }
    } else {
      categoryName = newProductForm.category === 'custom'
        ? (newProductForm.customCategory || '')
        : (newProductForm.category || '');
    }

    const categoryInfo = getCategorySnInfo(categoryName);
    categoryCode = categoryInfo.categoryCode;
    isLcdOrLed = categoryInfo.isLcdOrLed;

    // 2. Determine Brand Code (if not LCD/LED)
    let brandCode = '';
    if (!isLcdOrLed) {
      const brandSelect = generateBrand;
      if (brandSelect === 'CUSTOM') {
        brandCode = (generateCustomBrand.trim().toUpperCase() || 'XX').substring(0, 2).padEnd(2, 'X');
      } else {
        const brandMap = {
          'ASUS': 'AS',
          'ACER': 'AC',
          'HP': 'HP',
          'DELL': 'DE',
          'LENOVO': 'LE'
        };
        brandCode = brandMap[brandSelect] || 'XX';
      }
    }

    // 3. Determine Date Code (YYMMDD)
    let dateCode = '260601';
    if (generateDate) {
      const parts = generateDate.split('-');
      if (parts.length === 3) {
        const yy = parts[0].substring(2, 4);
        const mm = parts[1];
        const dd = parts[2];
        dateCode = `${yy}${mm}${dd}`;
      }
    }

    // 4. Generate sequential S/Ns
    const newSns = [];
    const startNum = parseInt(generateStartNum, 10) || 1;
    const qty = parseInt(generateQty, 10) || 0;
    for (let i = 0; i < qty; i++) {
      const currentNum = startNum + i;
      const seqStr = String(currentNum).padStart(3, '0');
      let sn = '';
      if (isLcdOrLed) {
        sn = `${categoryCode}-${dateCode}${seqStr}`;
      } else {
        sn = `${categoryCode}-${brandCode}-${dateCode}${seqStr}`;
      }
      newSns.push(sn);
    }

    // Combine avoiding duplicates
    setInputSerialNumbers(prev => {
      const combined = [...prev];
      newSns.forEach(sn => {
        if (!combined.includes(sn)) {
          combined.push(sn);
        }
      });
      return combined;
    });

    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message: `Berhasil meng-generate ${newSns.length} Serial Number!`, type: 'success' }
    }));
  };

  const handleAddManualSN = (e) => {
    if (e) e.preventDefault();
    const cleanSn = manualSnInput.trim().toUpperCase();
    if (!cleanSn) return;
    if (inputSerialNumbers.includes(cleanSn)) {
      alert('Serial Number ini sudah ada di daftar!');
      return;
    }
    setInputSerialNumbers([...inputSerialNumbers, cleanSn]);
    setManualSnInput('');
  };

  const handleSaveInputSparepart = async (e) => {
    if (e) e.preventDefault();

    if (inputSerialNumbers.length === 0) {
      alert('Daftar Serial Number kosong! Mohon input / generate S/N terlebih dahulu.');
      return;
    }

    try {
      if (inputSubTab === 'existing') {
        if (!selectedProductId) {
          alert('Silakan pilih suku cadang dari katalog terlebih dahulu!');
          return;
        }
        const selectedProd = products.find(p => p.id === selectedProductId);
        if (!selectedProd) throw new Error('Suku cadang tidak ditemukan!');

        await db.addProductStock(selectedProductId, inputSerialNumbers.length, inputSerialNumbers);
        
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: `Berhasil menambahkan ${inputSerialNumbers.length} unit stok untuk ${selectedProd.name}!`, type: 'success' }
        }));
      } else {
        const finalCategory = newProductForm.category === 'custom'
          ? (newProductForm.customCategory || '').trim()
          : (newProductForm.category || '').trim();

        if (!newProductForm.name || !newProductForm.sku || !finalCategory || !newProductForm.price) {
          alert('Mohon lengkapi semua data wajib suku cadang baru!');
          return;
        }

        const cleanDesc = (newProductForm.description || '').trim();
        const snSuffix = inputSerialNumbers.length > 0 ? ` ||SN: ${inputSerialNumbers.join(', ')}` : '';

        const newProd = {
          name: newProductForm.name,
          sku: newProductForm.sku,
          category: finalCategory,
          price: parseFloat(newProductForm.price) || 0,
          stock: inputSerialNumbers.length,
          description: cleanDesc + snSuffix
        };

        await db.createProduct(newProd);

        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: `Berhasil mendaftarkan produk baru "${newProd.name}" dengan stok ${newProd.stock} unit!`, type: 'success' }
        }));
      }

      // Reset
      setInputSerialNumbers([]);
      setManualSnInput('');
      setSelectedProductId('');
      setNewProductForm({
        sku: '',
        name: '',
        category: '',
        customCategory: '',
        price: '',
        description: ''
      });
      
      await reloadData();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Gagal menyimpan input: ${err.message}`, type: 'error' }
      }));
    }
  };

  // --- STICKER PRINT HANDLERS ---
  const handlePrintInputStickers = () => {
    if (inputSerialNumbers.length === 0) {
      alert('Daftar Serial Number kosong! Mohon input / generate S/N terlebih dahulu.');
      return;
    }

    let name = '';
    let sku = '';

    if (inputSubTab === 'existing') {
      const selectedProd = products.find(p => p.id === selectedProductId);
      if (selectedProd) {
        name = selectedProd.name;
        sku = selectedProd.sku;
      }
    } else {
      name = newProductForm.name;
      sku = newProductForm.sku;
    }

    const list = inputSerialNumbers.map(sn => ({
      sku: sku || 'KUSTOM',
      name: name || 'Barang Kustom',
      sn: sn
    }));

    setStickersToPrint(list);
    setStickerModalOpen(true);
  };

  const handleToggleCatalogSnSelect = (productId, sn) => {
    const current = selectedCatalogSns[productId] || [];
    let updated = [];
    if (current.includes(sn)) {
      updated = current.filter(item => item !== sn);
    } else {
      updated = [...current, sn];
    }
    setSelectedCatalogSns({
      ...selectedCatalogSns,
      [productId]: updated
    });
  };

  const handleSelectAllCatalogSns = (productId, sns) => {
    setSelectedCatalogSns({
      ...selectedCatalogSns,
      [productId]: sns
    });
  };

  const handleDeselectAllCatalogSns = (productId) => {
    setSelectedCatalogSns({
      ...selectedCatalogSns,
      [productId]: []
    });
  };

  const handlePrintSelectedCatalogStickers = (product) => {
    const selected = selectedCatalogSns[product.id] || [];
    if (selected.length === 0) {
      alert('Silakan pilih minimal satu Serial Number untuk dicetak!');
      return;
    }

    const list = selected.map(sn => ({
      sku: product.sku,
      name: product.name,
      sn: sn
    }));

    setStickersToPrint(list);
    setStickerModalOpen(true);
  };

  const triggerStickerPrint = () => {
    const styleId = 'dynamic-print-size';
    const oldStyle = document.getElementById(styleId);
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      @media print {
        @page {
          size: ${printSettings.paperWidth}mm ${printSettings.paperHeight}mm;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
        }
      }
    `;
    document.head.appendChild(style);
    
    window.print();
    
    window.onafterprint = () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  };

  // --- EXCEL EXPORT HANDLERS ---
  const handleExportProductsExcel = () => {
    try {
      const data = products.map(p => {
        const hasSns = p.description && p.description.includes('||SN:');
        const snsList = hasSns 
          ? p.description.split('||SN:')[1].trim()
          : '';
        const cleanDesc = hasSns 
          ? p.description.split('||SN:')[0].trim() 
          : (p.description || '');

        return {
          'MASTER/SKU': p.sku,
          'Nama Suku Cadang': p.name,
          'Kategori': p.category,
          'Harga Satuan (IDR)': p.price,
          'Stok Tersedia (pcs)': p.stock,
          'Deskripsi': cleanDesc,
          'Daftar Serial Number': snsList
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Katalog Spareparts");
      
      // Auto-fit column widths
      const maxLens = {};
      data.forEach(row => {
        Object.keys(row).forEach(key => {
          const val = row[key] ? row[key].toString() : '';
          maxLens[key] = Math.max(maxLens[key] || 10, val.length);
        });
      });
      ws['!cols'] = Object.keys(maxLens).map(key => ({ wch: Math.min(maxLens[key] + 2, 40) }));

      XLSX.writeFile(wb, `katalog-sparepart-pusat-${new Date().toISOString().split('T')[0]}.xlsx`);
      
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Katalog berhasil diexport ke Excel!', type: 'success' }
      }));
    } catch (err) {
      alert('Gagal export katalog: ' + err.message);
    }
  };

  const handleExportOrdersExcel = () => {
    try {
      const flatRows = [];
      orders.forEach(order => {
        const orderIdFormatted = (order.id || '').substring(0, 8).toUpperCase();
        
        // Find branch name
        const branchUser = users.find(u => u.username === order.branchUsername);
        const branchName = branchUser ? branchUser.displayName : order.branchUsername;

        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            flatRows.push({
              'ID Pesanan': orderIdFormatted,
              'Cabang Pemesan': branchName,
              'Kota': branchUser?.location || '-',
              'Tanggal Order': order.orderDate || '-',
              'Tanggal Dibutuhkan': order.requiredDate || '-',
              'Status Pesanan': (order.status || '').toUpperCase(),
              'Tingkat Urgensi': (order.urgency || '').toUpperCase(),
              'MASTER/SKU': item.sku || 'KUSTOM',
              'Nama Sparepart': item.name,
              'Jumlah (Qty)': item.qty,
              'Harga Satuan (IDR)': item.price,
              'Subtotal (IDR)': item.qty * item.price,
              'Serial Numbers (S/N)': item.serialNumbers || '-',
              'Catatan Cabang': order.notes || '-'
            });
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(flatRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Pesanan");

      // Auto-fit column widths
      const maxLens = {};
      if (flatRows.length > 0) {
        flatRows.forEach(row => {
          Object.keys(row).forEach(key => {
            const val = row[key] ? row[key].toString() : '';
            maxLens[key] = Math.max(maxLens[key] || 10, val.length);
          });
        });
        ws['!cols'] = Object.keys(maxLens).map(key => ({ wch: Math.min(maxLens[key] + 2, 45) }));
      }

      XLSX.writeFile(wb, `rekap-pesanan-cabang-${new Date().toISOString().split('T')[0]}.xlsx`);

      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Rekap pesanan berhasil diexport ke Excel!', type: 'success' }
      }));
    } catch (err) {
      alert('Gagal export pesanan: ' + err.message);
    }
  };

  // --- BACKUP HANDLERS ---
  const handleExportDB = async () => {
    try {
      const dataStr = await db.exportDatabase();
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `els-db-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Database berhasil di-export ke JSON!', type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    }
  };

  const handleImportDB = async (e) => {
    e.preventDefault();
    if (!backupFileContent) {
      alert('Pilih file backup JSON terlebih dahulu!');
      return;
    }
    if (window.confirm('PERINGATAN: Mengimpor database akan menimpa semua data transaksi, cabang, dan produk yang ada saat ini. Lanjutkan?')) {
      try {
        await db.importDatabase(backupFileContent);
        await reloadData();
        setBackupFileContent('');
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Database berhasil dipulihkan dari backup!', type: 'success' }
        }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: err.message, type: 'error' }
        }));
      }
    }
  };

  const handleFileChange = (e) => {
    const fileReader = new FileReader();
    const file = e.target.files[0];
    if (file) {
      fileReader.onload = (event) => {
        setBackupFileContent(event.target.result);
      };
      fileReader.readAsText(file);
    }
  };

  const handleResetDB = async () => {
    if (window.confirm('APAKAH ANDA YAKIN? Semua pesanan, produk kustom, dan akun cabang kustom akan dihapus permanen dan di-reset ke data bawaan pabrik.')) {
      try {
        await db.resetDatabase();
        await reloadData();
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Database berhasil di-reset ke setelan awal!', type: 'success' }
        }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: err.message, type: 'error' }
        }));
      }
    }
  };

  // --- FILTERED DATA COMPUTATION ---
  const branchUsers = users.filter((u) => u.role === 'cabang');
  const pendingOrdersCount = orders.filter((o) => o.status === 'pending').length;
  
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.id.toLowerCase().includes(orderSearch.toLowerCase()) ||
      order.branchName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      order.items.some(i => i.name.toLowerCase().includes(orderSearch.toLowerCase()));
      
    const matchesBranch = orderBranchFilter === 'all' || order.branchUsername === orderBranchFilter;
    const matchesStatus = orderStatusFilter === 'all' || order.status === orderStatusFilter;
    
    return matchesSearch && matchesBranch && matchesStatus;
  });

  const filteredProducts = products.filter((product) => {
    const matchesSearch = 
      product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      product.sku.toLowerCase().includes(productSearch.toLowerCase());
      
    const matchesCategory = productCategoryFilter === 'all' || product.category === productCategoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(products.map(p => p.category))];

  // Get top 5 ordered products dynamically
  const getPopularProducts = () => {
    const counts = {};
    orders.forEach(order => {
      if (order.status !== 'cancelled') {
        order.items.forEach(item => {
          const key = item.productId;
          if (!counts[key]) {
            counts[key] = {
              id: item.productId,
              name: item.name,
              sku: item.productId.startsWith('custom-') ? 'KUSTOM' : '',
              category: 'Lainnya',
              price: item.price,
              stock: 0,
              totalQty: 0
            };
          }
          counts[key].totalQty += item.qty;
        });
      }
    });

    // Match with actual catalog products for price, stock, sku, category
    Object.keys(counts).forEach(key => {
      const prod = products.find(p => p.id === key);
      if (prod) {
        counts[key].sku = prod.sku;
        counts[key].category = prod.category;
        counts[key].price = prod.price;
        counts[key].stock = prod.stock;
      } else if (key.startsWith('custom-')) {
        counts[key].sku = 'KUSTOM';
        counts[key].category = 'Request Kustom';
        counts[key].stock = '-';
      }
    });

    const sorted = Object.values(counts).sort((a, b) => b.totalQty - a.totalQty);
    
    if (sorted.length > 0) {
      return sorted.slice(0, 5);
    }
    
    // Fallback to catalog products if no orders yet
    return products.slice(0, 5).map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: p.price,
      stock: p.stock,
      totalQty: 0
    }));
  };

  return (
    <div className="layout-wrapper">
      {isLoading && <div className="top-loading-bar" />}
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand">
            <img src="/favicon.png" alt="ELS Logo" style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover' }} />
            <div className="sidebar-brand-name">ELS Pusat</div>
          </div>
          
          <nav className="sidebar-menu">
            <button 
              className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="17" x2="9" y2="9"></line><line x1="15" y1="17" x2="15" y2="13"></line><line x1="12" y1="17" x2="12" y2="11"></line></svg>
              Ringkasan
            </button>
            <button 
              className={`sidebar-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('orders'); reloadData(); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
              Pesanan Masuk {pendingOrdersCount > 0 && <span style={{backgroundColor:'var(--accent)', color:'var(--text-inverse)', borderRadius:'10px', padding:'2px 6px', fontSize:'10px', marginLeft:'8px'}}>{pendingOrdersCount}</span>}
            </button>
            <button 
              className={`sidebar-item ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => { setActiveTab('products'); reloadData(); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Katalog Sparepart
            </button>
            <button 
              className={`sidebar-item ${activeTab === 'input_sparepart' ? 'active' : ''}`}
              onClick={() => { setActiveTab('input_sparepart'); reloadData(); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
              Input Sparepart
            </button>
            <button 
              className={`sidebar-item ${activeTab === 'branches' ? 'active' : ''}`}
              onClick={() => { setActiveTab('branches'); reloadData(); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              Kelola Cabang
            </button>
            <button 
              className={`sidebar-item ${activeTab === 'backup' ? 'active' : ''}`}
              onClick={() => setActiveTab('backup')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path></svg>
              Sistem & Backup
            </button>
          </nav>
        </div>

        <div className="sidebar-user">
          <div className="user-profile-summary">
            <div className="avatar">A</div>
            <div className="user-info">
              <span className="user-name">{user.displayName}</span>
              <span className="user-role">Superadmin Pusat</span>
            </div>
          </div>
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
              {activeTab === 'overview' && 'Ringkasan Analitik ELS'}
              {activeTab === 'orders' && 'Manajemen Pesanan Cabang'}
              {activeTab === 'products' && 'Kelola Katalog Suku Cadang'}
              {activeTab === 'input_sparepart' && 'Input & Tambah Suku Cadang'}
              {activeTab === 'branches' && 'Daftar & Registrasi Cabang'}
              {activeTab === 'backup' && 'Pengaturan Sistem & Database'}
            </h1>
          </div>
          <div className="header-actions">
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Lokasi: <strong>{user.location}</strong>
            </div>
          </div>
        </header>

        <div className="content-body">
          
          {/* --- TAB 1: OVERVIEW/SUMMARY --- */}
          {activeTab === 'overview' && (
            <div className="fade-in-up">
              {/* Stats Grid */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  </div>
                  <div className="stat-info">
                    <span className="stat-value">
                      {formatIDR(orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.grandTotal, 0))}
                    </span>
                    <span className="stat-label">Total Omset Pesanan Aktif</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon" style={{backgroundColor: 'var(--status-pending-bg)', color: 'var(--status-pending)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                  </div>
                  <div className="stat-info">
                    <span className="stat-value">{orders.filter(o => o.status === 'pending').length}</span>
                    <span className="stat-label">Menunggu Persetujuan</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon" style={{backgroundColor: 'var(--status-completed-bg)', color: 'var(--status-completed)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  </div>
                  <div className="stat-info">
                    <span className="stat-value">{orders.filter(o => o.status === 'completed').length}</span>
                    <span className="stat-label">Pemesanan Selesai</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon" style={{backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                  <div className="stat-info">
                    <span className="stat-value">{branchUsers.length}</span>
                    <span className="stat-label">Cabang Terdaftar</span>
                  </div>
                </div>
              </div>

              {/* Layout Split */}
              <div className="grid-two-columns" style={{ textAlign: 'left' }}>
                {/* Popular Products */}
                <div className="card-table-wrapper" style={{ padding: '24px' }}>
                  <h3 className="section-title" style={{ marginBottom: '16px' }}>Suku Cadang Terpopuler</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {getPopularProducts().map((p, idx) => (
                      <div key={p.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent)' }}>#{idx + 1}</span>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '14px' }}>{p.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              MASTER: {p.sku} | Kategori: {p.category} | Diorder: <strong>{p.totalQty} pcs</strong>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--primary)' }}>{formatIDR(p.price)}</div>
                          <div style={{ fontSize: '12px', color: p.stock === '-' || p.stock >= 20 ? 'var(--status-completed)' : 'var(--status-cancelled)', fontWeight: 600 }}>
                            Stok: {p.stock} {typeof p.stock === 'number' ? 'pcs' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Branch Order Distribution */}
                <div className="card-table-wrapper" style={{ padding: '24px' }}>
                  <h3 className="section-title" style={{ marginBottom: '16px' }}>Distribusi Pesanan Cabang</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {branchUsers.map((b) => {
                      const branchOrders = orders.filter(o => o.branchUsername === b.username);
                      const totalBranchSales = branchOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.grandTotal, 0);
                      const percentage = orders.length > 0 ? (branchOrders.length / orders.length) * 100 : 0;
                      
                      return (
                        <div key={b.username}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px', fontWeight: 600 }}>
                            <span>{b.displayName} ({b.location})</span>
                            <span style={{ color: 'var(--primary)' }}>{branchOrders.length} Pesanan ({formatIDR(totalBranchSales)})</span>
                          </div>
                          <div style={{ height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                height: '100%', 
                                width: `${percentage}%`, 
                                background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                                borderRadius: '4px'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {branchUsers.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>Belum ada cabang terdaftar.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- TAB 2: INCOMING ORDERS --- */}
          {activeTab === 'orders' && (
            <div className="card-table-wrapper fade-in-up">
              {/* Controls */}
              <div className="table-controls">
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Cari ID order, cabang, sparepart..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </div>
                
                <select 
                  className="form-input" 
                  style={{ width: '180px', padding: '10px' }}
                  value={orderBranchFilter}
                  onChange={(e) => setOrderBranchFilter(e.target.value)}
                >
                  <option value="all">Semua Cabang</option>
                  {branchUsers.map(b => (
                    <option key={b.username} value={b.username}>{b.displayName}</option>
                  ))}
                </select>

                <select 
                  className="form-input" 
                  style={{ width: '180px', padding: '10px' }}
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                >
                  <option value="all">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Disetujui</option>
                  <option value="processing">Diproses</option>
                  <option value="shipped">Dikirim</option>
                  <option value="completed">Selesai</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>ID Order</th>
                      <th>Asal Cabang</th>
                      <th>Tanggal Pemesanan</th>
                      <th>Batas Pengiriman</th>
                      <th>Total Transaksi</th>
                      <th>Status</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const isExpanded = expandedOrderId === order.id;
                      return (
                        <React.Fragment key={order.id}>
                          <tr 
                            onClick={() => toggleExpandOrder(order.id)} 
                            style={{ cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                          >
                            <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{order.id}</td>
                            <td>
                              <div style={{ fontWeight: '600' }}>{order.branchName}</div>
                            </td>
                            <td>{formatDate(order.date)}</td>
                            <td>
                              <span style={{ fontWeight: 500 }}>{order.requiredDate}</span>
                            </td>
                            <td style={{ fontWeight: '700' }}>{formatIDR(order.grandTotal)}</td>
                            <td>
                              <span className={`badge badge-${order.status}`}>{order.status}</span>
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button 
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => toggleExpandOrder(order.id)}
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                >
                                  {isExpanded ? 'Tutup ▲' : 'Detail ▼'}
                                </button>
                                <button 
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleDeleteOrder(order.id)}
                                  style={{ padding: '6px', fontSize: '12px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled)', borderColor: 'rgba(220,38,38,0.2)' }}
                                  title="Hapus Pesanan"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded Details Row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan="7" style={{ padding: 0, backgroundColor: 'var(--bg-app)' }}>
                                <div className="order-details-expanded">
                                  <div className="order-expanded-grid" style={{textAlign: 'left'}}>
                                    
                                    {/* Items List */}
                                    <div>
                                      <h4 className="expanded-section-title">Item Suku Cadang yang Dipesan</h4>
                                      <div className="expanded-item-list">
                                        {order.items.map((item, index) => {
                                          const originalQty = (() => {
                                            if (item.serialNumbers && item.serialNumbers.startsWith('orig:')) {
                                              return parseInt(item.serialNumbers.replace('orig:', ''), 10);
                                            }
                                            return item.qty;
                                          })();
                                          const isItemCancelled = item.qty === 0;

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
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px',
                                                opacity: isItemCancelled ? 0.6 : 1
                                              }}
                                            >
                                              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                <div>
                                                  <span style={{ 
                                                    fontWeight: '600', 
                                                    textDecoration: isItemCancelled ? 'line-through' : 'none',
                                                    color: isItemCancelled ? 'var(--text-muted)' : 'var(--text-main)'
                                                  }}>
                                                    {item.name}
                                                  </span>
                                                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                      {formatIDR(item.price)} x {item.qty} pcs
                                                    </span>
                                                    <span className={`badge badge-urgency ${item.urgency || 'medium'}`} style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center' }}>
                                                      <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.urgency === 'high' ? 'var(--status-cancelled)' : item.urgency === 'low' ? 'var(--status-completed)' : 'rgb(245, 158, 11)', marginRight: '6px'}} />
                                                      {item.urgency === 'high' ? 'Urgen' : item.urgency === 'low' ? 'Biasa' : 'Sedang'}
                                                    </span>
                                                    {order.status === 'pending' && (
                                                      <>
                                                        {isItemCancelled ? (
                                                          <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled)', fontWeight: '600', display: 'inline-flex', alignItems: 'center' }}>
                                                            <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-cancelled)', marginRight: '6px'}} />
                                                            Kosong (Dibatalkan)
                                                          </span>
                                                        ) : item.qty < originalQty ? (
                                                          <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'rgb(245, 158, 11)', fontWeight: '600', display: 'inline-flex', alignItems: 'center' }}>
                                                            <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'rgb(245, 158, 11)', marginRight: '6px'}} />
                                                            Hanya Ready {item.qty} (dari {originalQty})
                                                          </span>
                                                        ) : (
                                                          <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-completed)', fontWeight: '600', display: 'inline-flex', alignItems: 'center' }}>
                                                            <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-completed)', marginRight: '6px'}} />
                                                            Siap Kirim
                                                          </span>
                                                        )}
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                                <div style={{ fontWeight: '700', alignSelf: 'center', color: isItemCancelled ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                                  {formatIDR(item.price * item.qty)}
                                                </div>
                                              </div>

                                              {/* Quantity Controls for Pending Orders */}
                                              {order.status === 'pending' && (
                                                <div 
                                                  style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center', 
                                                    marginTop: '6px', 
                                                    padding: '8px 12px', 
                                                    backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-color)' 
                                                  }}
                                                >
                                                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Persetujuan Item:</span>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden', height: '26px' }}>
                                                      <button
                                                        type="button"
                                                        style={{ 
                                                          width: '26px', 
                                                          height: '26px', 
                                                          border: 'none', 
                                                          background: 'none', 
                                                          color: 'var(--text-main)', 
                                                          cursor: item.qty <= 0 ? 'not-allowed' : 'pointer', 
                                                          display: 'flex', 
                                                          alignItems: 'center', 
                                                          justifyContent: 'center', 
                                                          opacity: item.qty <= 0 ? 0.3 : 1,
                                                          fontSize: '14px',
                                                          borderRight: '1px solid var(--border-color)'
                                                        }}
                                                        disabled={item.qty <= 0}
                                                        onClick={() => handleUpdatePendingItemQty(order.id, item.productId, item.qty - 1)}
                                                      >
                                                        -
                                                      </button>
                                                      <span style={{ fontSize: '12px', fontWeight: '600', width: '36px', textAlign: 'center', color: 'var(--text-main)' }}>
                                                        {item.qty}
                                                      </span>
                                                      <button
                                                        type="button"
                                                        style={{ 
                                                          width: '26px', 
                                                          height: '26px', 
                                                          border: 'none', 
                                                          background: 'none', 
                                                          color: 'var(--text-main)', 
                                                          cursor: item.qty >= originalQty ? 'not-allowed' : 'pointer', 
                                                          display: 'flex', 
                                                          alignItems: 'center', 
                                                          justifyContent: 'center', 
                                                          opacity: item.qty >= originalQty ? 0.3 : 1,
                                                          fontSize: '14px',
                                                          borderLeft: '1px solid var(--border-color)'
                                                        }}
                                                        disabled={item.qty >= originalQty}
                                                        onClick={() => handleUpdatePendingItemQty(order.id, item.productId, item.qty + 1)}
                                                      >
                                                        +
                                                      </button>
                                                    </div>
                                                    
                                                    {isItemCancelled ? (
                                                      <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ 
                                                          padding: '0 10px', 
                                                          fontSize: '11px', 
                                                          height: '26px', 
                                                          display: 'flex', 
                                                          alignItems: 'center', 
                                                          gap: '4px',
                                                          color: 'var(--primary)',
                                                          borderColor: 'var(--primary)',
                                                          background: 'none'
                                                        }}
                                                        onClick={() => handleUpdatePendingItemQty(order.id, item.productId, originalQty)}
                                                      >
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                                                        Puluhkan
                                                      </button>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ 
                                                          padding: '0 10px', 
                                                          fontSize: '11px', 
                                                          height: '26px', 
                                                          display: 'flex', 
                                                          alignItems: 'center', 
                                                          gap: '4px',
                                                          color: 'var(--status-cancelled)',
                                                          borderColor: 'rgba(220,38,38,0.2)',
                                                          background: 'none'
                                                        }}
                                                        onClick={() => handleUpdatePendingItemQty(order.id, item.productId, 0)}
                                                      >
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        Tandai Kosong
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                              )}

                                              {/* Serial Number Section for Admin Pusat */}
                                              {['pending', 'approved', 'processing'].includes(order.status) && item.qty > 0 ? (
                                                <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '10px', width: '100%' }}>
                                                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                      Scan / Input Serial Number (S/N):
                                                    </span>
                                                    {(() => {
                                                      const key = `${order.id}-${item.productId}`;
                                                      const list = (serialInputLists[key] !== undefined 
                                                        ? serialInputLists[key] 
                                                        : (item.serialNumbers ? item.serialNumbers.split(', ').filter(Boolean) : [])).slice(0, item.qty);
                                                      return (
                                                        <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '800' }}>
                                                          Scanned: {list.length} / {item.qty} Pcs
                                                        </span>
                                                      );
                                                    })()}
                                                  </div>
                                                  
                                                  {/* List of Scanned Serial Numbers */}
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                                    {(() => {
                                                      const key = `${order.id}-${item.productId}`;
                                                      const list = (serialInputLists[key] !== undefined 
                                                        ? serialInputLists[key] 
                                                        : (item.serialNumbers ? item.serialNumbers.split(', ').filter(Boolean) : [])).slice(0, item.qty);
                                                      return (
                                                        <>
                                                          {list.map((sn, snIdx) => (
                                                            <div 
                                                              key={snIdx} 
                                                              style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '6px', 
                                                                backgroundColor: 'var(--primary-light)', 
                                                                color: 'var(--primary)', 
                                                                padding: '4px 10px', 
                                                                borderRadius: '20px', 
                                                                fontSize: '12px', 
                                                                fontWeight: '600',
                                                                border: '1px solid var(--primary)'
                                                              }}
                                                            >
                                                              <span>{snIdx + 1}. {sn}</span>
                                                              <button 
                                                                type="button"
                                                                onClick={() => handleDeleteSN(order.id, item.productId, snIdx)}
                                                                style={{ 
                                                                  background: 'none', 
                                                                  border: 'none', 
                                                                  color: 'var(--status-cancelled)', 
                                                                  cursor: 'pointer', 
                                                                  fontSize: '14px', 
                                                                  padding: '0 2px',
                                                                  display: 'flex',
                                                                  alignItems: 'center',
                                                                  fontWeight: '800'
                                                                }}
                                                                title="Hapus S/N"
                                                              >
                                                                ✕
                                                              </button>
                                                            </div>
                                                          ))}
                                                          {list.length === 0 && (
                                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Belum ada serial number yang di-scan.</span>
                                                          )}
                                                        </>
                                                      );
                                                    })()}
                                                  </div>

                                                  {/* Single Input Box (Emulates Barcode scanner entry) */}
                                                  {(() => {
                                                    const key = `${order.id}-${item.productId}`;
                                                    const list = (serialInputLists[key] !== undefined 
                                                      ? serialInputLists[key] 
                                                      : (item.serialNumbers ? item.serialNumbers.split(', ').filter(Boolean) : [])).slice(0, item.qty);
                                                    
                                                    return list.length < item.qty ? (
                                                      <div style={{ display: 'flex', gap: '8px' }}>
                                                        <input 
                                                          type="text"
                                                          className="form-input"
                                                          style={{ height: '36px', fontSize: '13px', padding: '6px 12px', margin: 0, flex: 1 }}
                                                          placeholder="Scan barcode / ketik serial number lalu tekan Enter..."
                                                          value={snInputs[key] || ''}
                                                          onChange={(e) => setSnInputs({ ...snInputs, [key]: e.target.value })}
                                                          onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                              e.preventDefault();
                                                              handleAddSN(order.id, item.productId, item.qty, e.target.value);
                                                            }
                                                          }}
                                                        />
                                                        <button
                                                          type="button"
                                                          className="btn btn-primary"
                                                          style={{ height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: '13px', gap: '4px' }}
                                                          onClick={() => handleAddSN(order.id, item.productId, item.qty, snInputs[key] || '')}
                                                        >
                                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                          Tambah
                                                        </button>
                                                      </div>
                                                    ) : (
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-completed)', fontWeight: '700', fontSize: '13px', padding: '8px 12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '6px' }}>
                                                        <span>✔</span> Semua unit ({list.length}/{item.qty}) selesai di-scan!
                                                      </div>
                                                    );
                                                  })()}
                                                  
                                                  <button
                                                    type="button"
                                                    onClick={() => handleSaveSNList(order.id, item.productId)}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ marginTop: '10px', width: '100%', fontSize: '11px', padding: '6px', borderStyle: 'solid', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                  >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                                    Simpan S/N Item Ini
                                                  </button>
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', marginTop: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '6px', fontWeight: '800' }}>
                                        <span>Total Keseluruhan:</span>
                                        <span style={{ color: 'var(--primary)' }}>{formatIDR(order.grandTotal)}</span>
                                      </div>
                                    </div>

                                    {/* Dispatch Controls & Notes */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                      <div>
                                        <h4 className="expanded-section-title">Catatan Cabang</h4>
                                        <div 
                                          style={{ 
                                            padding: '14px', 
                                            backgroundColor: 'var(--bg-card)', 
                                            borderRadius: '6px', 
                                            border: '1px dashed var(--accent)', 
                                            fontSize: '13px', 
                                            fontStyle: order.notes ? 'normal' : 'italic',
                                            lineHeight: '1.4'
                                          }}
                                        >
                                          {order.notes || 'Tidak ada catatan khusus.'}
                                        </div>
                                      </div>

                                      <div>
                                        <h4 className="expanded-section-title">Proses Status Pesanan (Pusat)</h4>
                                        
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                          {order.status === 'pending' && (
                                            <>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'approved')} 
                                                className="btn btn-primary btn-sm"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                Setujui & Siapkan
                                              </button>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'cancelled')} 
                                                className="btn btn-danger btn-sm"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                Batalkan Pesanan
                                              </button>
                                            </>
                                          )}

                                          {order.status === 'approved' && (
                                            <>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'processing')} 
                                                className="btn btn-primary btn-sm"
                                                style={{ background: 'var(--status-processing)', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon><polygon points="12 12 21 6.92 21 17.08 12 22.08"></polygon><polygon points="12 2 3 6.92 12 12 21 6.92 12 2"></polygon><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                                Mulai Proses Pengepakan
                                              </button>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'cancelled')} 
                                                className="btn btn-danger btn-sm"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                Batalkan
                                              </button>
                                            </>
                                          )}

                                          {order.status === 'processing' && (
                                            <>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'shipped')} 
                                                className="btn btn-primary btn-sm"
                                                style={{ background: 'var(--status-shipped)', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                                                Kirim Spareparts
                                              </button>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'cancelled')} 
                                                className="btn btn-danger btn-sm"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                Batalkan
                                              </button>
                                            </>
                                          )}

                                          {order.status === 'shipped' && (
                                            <>
                                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                Pesanan sedang dikirim ke cabang. Menunggu konfirmasi penerimaan dari cabang.
                                              </span>
                                              <button 
                                                onClick={() => handleUpdateStatus(order.id, 'completed')} 
                                                className="btn btn-secondary btn-sm"
                                                style={{ marginLeft: 'auto' }}
                                              >
                                                Konfirmasi Selesai Secara Manual
                                              </button>
                                            </>
                                          )}

                                          {order.status === 'completed' && (
                                            <span style={{ fontSize: '13px', color: 'var(--status-completed)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--status-completed)'}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                              Pemesanan ini telah selesai dan diterima dengan baik oleh cabang.
                                            </span>
                                          )}

                                          {order.status === 'cancelled' && (
                                            <span style={{ fontSize: '13px', color: 'var(--status-cancelled)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--status-cancelled)'}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                              Pesanan ini dibatalkan. Stok telah dikembalikan ke katalog utama.
                                            </span>
                                          )}
                                        </div>
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
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          Tidak ada pesanan masuk yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- TAB 3: PRODUCT CATALOG (CRUD) --- */}
          {activeTab === 'products' && (
            <div className="fade-in-up">
              <div className="section-header">
                <span className="section-title">Daftar Stok Suku Cadang Pusat</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Import Excel
                    <input 
                      type="file" 
                      accept=".xlsx, .xls" 
                      onChange={handleExcelImport} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                  <button onClick={openAddProductModal} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Tambah Sparepart Baru
                  </button>
                </div>
              </div>

              <div className="card-table-wrapper">
                {/* Search / Filters */}
                <div className="table-controls">
                  <div className="search-input-wrapper">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Cari sparepart berdasarkan nama atau Kode MASTER..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                  
                  <select
                    className="form-input"
                    style={{ width: '220px', padding: '10px' }}
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                  >
                    <option value="all">Semua Kategori</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>MASTER</th>
                        <th>Nama Suku Cadang</th>
                        <th>Kategori</th>
                        <th>Harga Satuan</th>
                        <th>Stok Tersedia</th>
                        <th>Deskripsi</th>
                        <th style={{ width: '150px', textAlign: 'right' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        Array.from({ length: 5 }).map((_, idx) => (
                          <tr key={idx}>
                            <td><div className="skeleton" style={{ width: '80px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '180px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '100px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '90px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '60px', height: '16px' }} /></td>
                            <td><div className="skeleton" style={{ width: '200px', height: '16px' }} /></td>
                            <td style={{ textAlign: 'right' }}><div className="skeleton" style={{ width: '120px', height: '28px', borderRadius: '4px' }} /></td>
                          </tr>
                        ))
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            Tidak ada suku cadang ditemukan.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => {
                          const hasSns = p.description && p.description.includes('||SN:');
                          const snsList = hasSns 
                            ? p.description.split('||SN:')[1].split(', ').map(s => s.trim()).filter(Boolean)
                            : [];
                          const cleanDesc = hasSns 
                            ? p.description.split('||SN:')[0].trim() 
                            : (p.description || '');

                          return (
                            <React.Fragment key={p.id}>
                              <tr 
                                onClick={() => setExpandedProductId(expandedProductId === p.id ? null : p.id)}
                                style={{ cursor: 'pointer' }}
                                className={expandedProductId === p.id ? 'row-expanded' : ''}
                              >
                                <td style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                  {p.sku}
                                </td>
                                <td>
                                  <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {p.name}
                                    {p.stock <= 3 && p.stock > 0 && (
                                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--status-pending)', fontWeight: '700' }}>
                                        Stok Menipis
                                      </span>
                                    )}
                                    {p.stock === 0 && (
                                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-cancelled)', fontWeight: '700' }}>
                                        Habis
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="badge-kategori" style={{ fontSize: '12px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(245,158,11,0.08)', color: 'var(--accent)' }}>
                                    {p.category}
                                  </span>
                                </td>
                                <td style={{ fontWeight: '600' }}>{formatIDR(p.price)}</td>
                                <td style={{ fontWeight: '700' }}>
                                  {p.stock} Pcs
                                  {p.stock === 0 && <span style={{fontSize:'10px', display:'block', color:'var(--status-cancelled)'}}>Habis!</span>}
                                </td>
                                <td style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {cleanDesc || '-'}
                                </td>
                                <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button 
                                      onClick={() => openEditProductModal(p)} 
                                      className="btn btn-secondary btn-sm"
                                      style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                      Edit
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteProduct(p.id, p.name)} 
                                      className="btn btn-danger btn-sm"
                                      style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                      Hapus
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expandedProductId === p.id && (
                                <tr key={`${p.id}-details`} style={{ backgroundColor: 'rgba(255, 255, 255, 0.01)' }}>
                                  <td colSpan="7" style={{ padding: '16px 24px', borderTop: 'none' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--primary)' }}>
                                          Daftar Serial Number (S/N) dalam Stok ({snsList.length} unit):
                                        </div>
                                        {snsList.length > 0 && (
                                          <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              style={{ padding: '2px 8px', fontSize: '11px' }}
                                              onClick={() => handleSelectAllCatalogSns(p.id, snsList)}
                                            >
                                              Pilih Semua
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              style={{ padding: '2px 8px', fontSize: '11px' }}
                                              onClick={() => handleDeselectAllCatalogSns(p.id)}
                                            >
                                              Kosongkan Pilihan
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-primary btn-sm"
                                              style={{ padding: '2px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                              disabled={!(selectedCatalogSns[p.id] || []).length}
                                              onClick={() => handlePrintSelectedCatalogStickers(p)}
                                            >
                                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                              Cetak Stiker Terpilih ({(selectedCatalogSns[p.id] || []).length})
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      {snsList.length === 0 ? (
                                        <div style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)' }}>
                                          Tidak ada serial number terdaftar untuk produk ini (stok kosong atau belum tercatat).
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                                          {snsList.map((sn, idx) => {
                                            const isSelected = (selectedCatalogSns[p.id] || []).includes(sn);
                                            return (
                                              <label 
                                                key={idx} 
                                                style={{ 
                                                  display: 'inline-flex', 
                                                  alignItems: 'center', 
                                                  gap: '6px',
                                                  fontFamily: 'monospace', 
                                                  fontSize: '12px', 
                                                  padding: '4px 8px', 
                                                  backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-card)', 
                                                  border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)', 
                                                  borderRadius: '4px',
                                                  fontWeight: '600',
                                                  cursor: 'pointer',
                                                  userSelect: 'none',
                                                  color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                                                  transition: 'all var(--transition-fast)'
                                                }}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => handleToggleCatalogSnSelect(p.id, sn)}
                                                  style={{ margin: 0, cursor: 'pointer' }}
                                                />
                                                {sn}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Product Modal Form */}
              {productModalOpen && createPortal(
                <div className="modal-overlay">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h3 className="section-title">{editingProduct ? 'Edit Suku Cadang' : 'Tambah Suku Cadang Baru'}</h3>
                      <button onClick={() => setProductModalOpen(false)} className="close-btn">✕</button>
                    </div>
                    <form onSubmit={handleProductSubmit}>
                      <div className="modal-body" style={{ textAlign: 'left' }}>
                        <div className="form-group">
                          <label className="form-label">Nama Sparepart</label>
                          <input
                            type="text"
                            required
                            className="form-input"
                            placeholder="Contoh: Kampas Rem Cakram Belakang"
                            value={productForm.name}
                            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                          />
                        </div>

                        <div className="form-grid-two-columns">
                          <div className="form-group">
                            <label className="form-label">Kode MASTER</label>
                            <input
                              type="text"
                              required
                              className="form-input"
                              placeholder="Contoh: MST-102"
                              value={productForm.sku}
                              onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                            />
                          </div>
                          
                          <div className="form-group">
                            <label className="form-label">Kategori</label>
                            <input
                              type="text"
                              required
                              className="form-input"
                              placeholder="Contoh: Baterai"
                              value={productForm.category}
                              onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="form-grid-two-columns">
                          <div className="form-group">
                            <label className="form-label">Harga Satuan (Rp)</label>
                            <input
                              type="number"
                              required
                              className="form-input"
                              placeholder="Contoh: 150000"
                              value={productForm.price}
                              onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label className="form-label">Stok Awal</label>
                            <input
                              type="number"
                              required
                              disabled={!!editingProduct}
                              className="form-input"
                              style={editingProduct ? { backgroundColor: 'var(--border-color)', cursor: 'not-allowed' } : {}}
                              placeholder="Contoh: 10"
                              value={productForm.stock}
                              onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Deskripsi Suku Cadang</label>
                          <textarea
                            className="form-input"
                            rows="3"
                            style={{ resize: 'vertical' }}
                            placeholder="Jelaskan spesifikasi detail barang..."
                            value={productForm.description}
                            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button type="button" onClick={() => setProductModalOpen(false)} className="btn btn-secondary">Batal</button>
                        <button type="submit" className="btn btn-primary">{editingProduct ? 'Simpan Perubahan' : 'Tambah Produk'}</button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body
              )}
            </div>
          )}

          {/* --- TAB 3.5: INPUT SPAREPART (NEW & EXISTING) --- */}
          {activeTab === 'input_sparepart' && (
            <div className="fade-in-up" style={{ textAlign: 'left' }}>
              <div className="section-header">
                <span className="section-title">Form Input & Penambahan Stok Suku Cadang</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={`btn ${inputSubTab === 'existing' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setInputSubTab('existing'); setInputSerialNumbers([]); }}
                  >
                    Tambah Stok Barang Lama
                  </button>
                  <button 
                    className={`btn ${inputSubTab === 'new' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setInputSubTab('new'); setInputSerialNumbers([]); }}
                  >
                    Daftar Barang Baru
                  </button>
                </div>
              </div>

              <div className="grid-branch-panel" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                
                {/* Form Input Section */}
                <div className="card-table-wrapper" style={{ padding: '24px', height: 'fit-content' }}>
                  {inputSubTab === 'existing' ? (
                    <div>
                      <h3 className="section-title" style={{ marginBottom: '8px' }}>Pilih Suku Cadang dari Katalog</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                        Pilih produk yang sudah ada di katalog pusat untuk ditambahkan jumlah stoknya.
                      </p>

                      <div className="form-group" style={{ marginBottom: '20px' }}>
                        <label className="form-label">Suku Cadang (Nama / SKU)</label>
                        <select
                          className="form-input"
                          style={{ padding: '10px' }}
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value)}
                        >
                          <option value="">-- Pilih Suku Cadang --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              [{p.sku}] - {p.name} (Stok: {p.stock} pcs)
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedProductId && (() => {
                        const sel = products.find(p => p.id === selectedProductId);
                        if (!sel) return null;
                        return (
                          <div 
                            style={{ 
                              padding: '14px', 
                              backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                              borderRadius: '6px', 
                              border: '1px solid var(--border-color)', 
                              fontSize: '13px',
                              marginBottom: '20px'
                            }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div><strong>SKU / MASTER:</strong> {sel.sku}</div>
                              <div><strong>Kategori:</strong> {sel.category}</div>
                              <div><strong>Harga:</strong> {formatIDR(sel.price)}</div>
                              <div><strong>Stok Saat Ini:</strong> {sel.stock} pcs</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div>
                      <h3 className="section-title" style={{ marginBottom: '8px' }}>Daftarkan Suku Cadang Baru</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                        Masukkan informasi untuk sparepart baru yang belum terdaftar di katalog pusat.
                      </p>

                      <div className="form-group">
                        <label className="form-label">Kode MASTER (SKU)</label>
                        <input
                          type="text"
                          required
                          className="form-input"
                          placeholder="Contoh: KBD-LEN-T490"
                          value={newProductForm.sku}
                          onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Nama Suku Cadang</label>
                        <input
                          type="text"
                          required
                          className="form-input"
                          placeholder="Contoh: Keyboard Lenovo Thinkpad T490 US Layout"
                          value={newProductForm.name}
                          onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                        />
                      </div>

                      <div className="form-grid-two-columns">
                        <div className="form-group">
                          <label className="form-label">Kategori Suku Cadang</label>
                          <select
                            className="form-input"
                            value={newProductForm.category}
                            onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                          >
                            <option value="">-- Pilih Kategori --</option>
                            <option value="Baterai">Baterai</option>
                            <option value="Adaptor">Adaptor</option>
                            <option value="Keyboard">Keyboard</option>
                            <option value="Touchpad">Touchpad</option>
                            <option value="LCD & LED">LCD & LED</option>
                            <option value="Lain-lain">Lain-lain</option>
                            <option value="custom">+ Tulis Kategori Baru...</option>
                          </select>
                          
                          {newProductForm.category === 'custom' && (
                            <input
                              type="text"
                              required
                              className="form-input"
                              style={{ marginTop: '8px', borderColor: 'var(--accent)' }}
                              placeholder="Ketik kategori baru..."
                              value={newProductForm.customCategory || ''}
                              onChange={(e) => setNewProductForm({ ...newProductForm, customCategory: e.target.value })}
                            />
                          )}
                        </div>

                        <div className="form-group">
                          <label className="form-label">Harga Satuan (IDR)</label>
                          <input
                            type="number"
                            required
                            min="0"
                            className="form-input"
                            placeholder="Contoh: 280000"
                            value={newProductForm.price}
                            onChange={(e) => setNewProductForm({ ...newProductForm, price: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Deskripsi Suku Cadang</label>
                        <textarea
                          className="form-input"
                          rows="3"
                          style={{ resize: 'vertical' }}
                          placeholder="Jelaskan spesifikasi detail barang..."
                          value={newProductForm.description}
                          onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Serial Number Generator Panel */}
                  <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                    <h4 className="section-title" style={{ fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                      Otomatis Generate Serial Number (S/N)
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Jumlah Unit</label>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ height: '36px', fontSize: '12px' }}
                          value={generateQty}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGenerateQty(val === '' ? '' : (parseInt(val, 10) || 0));
                          }}
                        />
                      </div>

                      {/* Brand selector (only relevant if NOT LCD/LED) */}
                      {(() => {
                        let isLcd = false;
                        if (inputSubTab === 'existing') {
                          const sel = products.find(p => p.id === selectedProductId);
                          isLcd = sel ? (sel.category || '').toLowerCase().includes('lcd') || (sel.category || '').toLowerCase().includes('led') : false;
                        } else {
                          isLcd = (newProductForm.category || '').toLowerCase().includes('lcd') || (newProductForm.category || '').toLowerCase().includes('led');
                        }
                        
                        return !isLcd ? (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: '11px' }}>Merk Barang</label>
                            <select
                              className="form-input"
                              style={{ 
                                height: '36px', 
                                fontSize: '12px', 
                                padding: '0 8px',
                                backgroundColor: (inputSubTab === 'existing' && ['ASUS', 'ACER', 'HP', 'DELL', 'LENOVO'].includes(generateBrand)) ? 'var(--border-color)' : 'transparent',
                                cursor: (inputSubTab === 'existing' && ['ASUS', 'ACER', 'HP', 'DELL', 'LENOVO'].includes(generateBrand)) ? 'not-allowed' : 'default'
                              }}
                              value={generateBrand}
                              onChange={(e) => setGenerateBrand(e.target.value)}
                              disabled={inputSubTab === 'existing' && ['ASUS', 'ACER', 'HP', 'DELL', 'LENOVO'].includes(generateBrand)}
                            >
                              <option value="ASUS">ASUS (AS)</option>
                              <option value="ACER">ACER (AC)</option>
                              <option value="HP">HP (HP)</option>
                              <option value="DELL">DELL (DE)</option>
                              <option value="LENOVO">LENOVO (LE)</option>
                              <option value="CUSTOM">Custom Merk</option>
                            </select>
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* Custom Brand code input */}
                    {generateBrand === 'CUSTOM' && (
                      <div className="form-group" style={{ marginBottom: '12px' }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Kode Singkatan Merk Kustom (2 Karakter)</label>
                        <input
                          type="text"
                          maxLength="2"
                          className="form-input"
                          style={{ height: '36px', fontSize: '12px' }}
                          placeholder="Contoh: TO (Toshiba), MS (MSI)"
                          value={generateCustomBrand}
                          onChange={(e) => setGenerateCustomBrand(e.target.value.toUpperCase())}
                        />
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', marginBottom: '16px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Tanggal Penerimaan</label>
                        <input
                          type="date"
                          className="form-input"
                          style={{ height: '36px', fontSize: '12px', padding: '6px' }}
                          value={generateDate}
                          onChange={(e) => setGenerateDate(e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Mulai Nomor Urut</label>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ height: '36px', fontSize: '12px' }}
                          value={generateStartNum}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGenerateStartNum(val === '' ? '' : (parseInt(val, 10) || 0));
                          }}
                        />
                      </div>
                    </div>

                    <button 
                      type="button" 
                      onClick={handleGenerateSNs}
                      className="btn btn-secondary"
                      style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                      Generate Serial Number
                    </button>
                  </div>
                </div>

                {/* S/N List & Save Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="card-table-wrapper" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3 className="section-title" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Daftar S/N yang Di-input</span>
                      <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '800' }}>
                        Total: {inputSerialNumbers.length} Unit
                      </span>
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Ketik/scan manual barcode di bawah, atau generate otomatis di panel kiri.
                    </p>

                    {/* Manual Entry */}
                    <form onSubmit={handleAddManualSN} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Scan / ketik S/N lalu tekan Enter..."
                        style={{ height: '36px', fontSize: '13px', padding: '6px 12px', margin: 0, flex: 1 }}
                        value={manualSnInput}
                        onChange={(e) => setManualSnInput(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="btn btn-secondary"
                        style={{ height: '36px', display: 'flex', alignItems: 'center', fontSize: '13px', gap: '4px' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Tambah
                      </button>
                    </form>

                    {/* Scanned Serial Numbers Scroll Pane */}
                    <div 
                      style={{ 
                        flex: 1, 
                        minHeight: '220px', 
                        maxHeight: '300px', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '6px', 
                        padding: '10px', 
                        overflowY: 'auto',
                        backgroundColor: 'rgba(255, 255, 255, 0.01)',
                        marginBottom: '16px'
                      }}
                    >
                      {inputSerialNumbers.map((sn, idx) => (
                        <div 
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg-card)',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            marginBottom: '6px',
                            fontSize: '13px'
                          }}
                        >
                          <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{idx + 1}. {sn}</span>
                          <button
                            type="button"
                            onClick={() => setInputSerialNumbers(inputSerialNumbers.filter((_, i) => i !== idx))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--status-cancelled)',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: '2px 6px',
                              fontWeight: '800'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {inputSerialNumbers.length === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>
                          Belum ada Serial Number yang di-input / di-generate.
                        </div>
                      )}
                    </div>

                    {/* Copy/Paste Panel */}
                    {inputSerialNumbers.length > 0 && (
                      <div style={{ marginBottom: '16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', borderStyle: 'dashed' }}
                          onClick={() => {
                            navigator.clipboard.writeText(inputSerialNumbers.join('\n'));
                            alert('Seluruh Serial Number berhasil disalin ke clipboard!');
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                          Salin (Copy) Semua S/N ke Clipboard
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', borderStyle: 'solid' }}
                          onClick={handlePrintInputStickers}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                          Cetak Stiker S/N
                        </button>
                      </div>
                    )}

                    {/* Save Button */}
                    <button
                      type="button"
                      onClick={handleSaveInputSparepart}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', fontWeight: '700' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                      Simpan & Tambah Stok
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* --- TAB 4: MANAGE BRANCH ACCOUNTS --- */}
          {activeTab === 'branches' && (
            <div className="grid-branch-panel fade-in-up" style={{ textAlign: 'left' }}>
              
              {/* Branch Registration Form */}
              <div className="card-table-wrapper" style={{ padding: '24px', height: 'fit-content' }}>
                <h3 className="section-title" style={{ marginBottom: '8px' }}>Daftarkan Akun Cabang Baru</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Daftarkan akun cabang baru dengan username dan password kustom.
                </p>

                <form onSubmit={handleBranchSubmit}>
                  <div className="form-group">
                    <label className="form-label">Username Cabang</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Contoh: purwokerto, bandung, solo (bebas)"
                      value={branchForm.username}
                      onChange={(e) => setBranchForm({ ...branchForm, username: e.target.value.toLowerCase() })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Password Cabang</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Masukkan password akun cabang"
                      value={branchForm.password}
                      onChange={(e) => setBranchForm({ ...branchForm, password: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nama Cabang (Display Name)</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Contoh: ELS Purwokerto"
                      value={branchForm.displayName}
                      onChange={(e) => setBranchForm({ ...branchForm, displayName: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label className="form-label">Lokasi / Kota Cabang</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Contoh: Purwokerto, Jawa Tengah"
                      value={branchForm.location}
                      onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })}
                    />
                  </div>

                   <button type="submit" className="btn btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                     Simpan Akun Cabang
                   </button>
                </form>
              </div>

              {/* Registered Branches List */}
              <div className="card-table-wrapper" style={{ padding: '24px' }}>
                <h3 className="section-title" style={{ marginBottom: '16px' }}>Daftar Cabang Aktif</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {branchUsers.map((b) => {
                    const branchOrders = orders.filter(o => o.branchUsername === b.username);
                    return (
                      <div 
                        key={b.username} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '16px', 
                          backgroundColor: 'var(--bg-app)', 
                          borderRadius: '8px', 
                          border: '1px solid var(--border-color)' 
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '15px' }}>{b.displayName}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Username: <code>{b.username}</code> | Kota: {b.location}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span 
                            style={{ 
                              display: 'inline-block', 
                              padding: '4px 10px', 
                              borderRadius: '20px', 
                              backgroundColor: 'var(--primary-light)', 
                              color: 'var(--primary)',
                              fontSize: '12px',
                              fontWeight: 700,
                              marginRight: '8px'
                            }}
                          >
                            {branchOrders.length} Order
                          </span>
                           <button
                             onClick={() => handleEditBranchClick(b)}
                             className="btn btn-secondary btn-sm"
                             style={{ padding: '6px 10px', borderStyle: 'solid', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                           >
                             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                             Edit
                           </button>
                           <button
                             onClick={() => handleDeleteBranchClick(b.username)}
                             className="btn btn-secondary btn-sm"
                             style={{ padding: '6px 10px', borderStyle: 'solid', color: 'var(--status-cancelled)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                           >
                             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                             Hapus
                           </button>
                        </div>
                      </div>
                    );
                  })}
                  {branchUsers.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Belum ada cabang terdaftar.</p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* --- TAB 5: SYSTEM & BACKUP --- */}
          {activeTab === 'backup' && (
            <div className="grid-equal-two-columns fade-in-up" style={{ textAlign: 'left' }}>
              
              {/* Backup Database */}
              <div className="card-table-wrapper" style={{ padding: '24px' }}>
                <h3 className="section-title" style={{ marginBottom: '12px' }}>Backup & Export Data</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
                  Ekspor seluruh database atau pilih format laporan Excel untuk katalog dan riwayat pesanan cabang.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button onClick={handleExportDB} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Unduh File Backup Sistem (.json)
                  </button>

                  <div style={{ margin: '8px 0 0 0', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>Export Laporan Excel (.xlsx)</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={handleExportProductsExcel} 
                        className="btn btn-secondary btn-sm" 
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center', padding: '10px 14px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        Katalog Sparepart
                      </button>
                      <button 
                        onClick={handleExportOrdersExcel} 
                        className="btn btn-secondary btn-sm" 
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center', padding: '10px 14px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        Rekap Pesanan
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Restore Database */}
              <div className="card-table-wrapper" style={{ padding: '24px' }}>
                <h3 className="section-title" style={{ marginBottom: '12px' }}>Pulihkan / Import Data</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                  Pilih file cadangan JSON yang sebelumnya telah Anda download untuk mengembalikan seluruh keadaan database.
                </p>
                
                <form onSubmit={handleImportDB}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <input 
                      type="file" 
                      accept=".json"
                      onChange={handleFileChange}
                      className="form-input" 
                      style={{ padding: '8px' }}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn btn-secondary" 
                    disabled={!backupFileContent}
                    style={{ opacity: backupFileContent ? 1 : 0.6, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Pulihkan Database Sekarang
                  </button>
                </form>
              </div>

              {/* Reset System Danger Zone */}
              <div className="card-table-wrapper" style={{ padding: '24px', gridColumn: 'span 2', border: '1px solid rgba(220, 38, 38, 0.2)', backgroundColor: 'var(--status-cancelled-bg)' }}>
                <h3 className="section-title" style={{ color: 'var(--status-cancelled)', marginBottom: '8px' }}>Zona Berbahaya</h3>
                <p style={{ fontSize: '14px', color: 'var(--status-cancelled)', marginBottom: '20px', fontWeight: 500 }}>
                  Fitur reset akan menghapus seluruh data custom yang telah Anda tambahkan (transaksi order, produk baru, dan akun cabang buatan Anda) dan mengembalikan database ke setelan awal pabrik.
                </p>
                <button onClick={handleResetDB} className="btn btn-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  Reset Database ke Setelan Pabrik
                </button>
              </div>

            </div>
          )}

        </div>
      </main>

        {/* Edit Branch Modal */}
        {branchModalOpen && editingBranch && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '450px' }}>
              <div className="modal-header">
                <h3 className="section-title">Edit Akun Cabang</h3>
                <button onClick={() => { setBranchModalOpen(false); setEditingBranch(null); setBranchForm({ username: '', password: '', displayName: '', location: '' }); }} className="close-btn">✕</button>
              </div>
              <form onSubmit={handleEditBranchSubmit}>
                <div className="modal-body" style={{ textAlign: 'left' }}>
                  <div className="form-group">
                    <label className="form-label">Username Cabang</label>
                    <input 
                      type="text"
                      disabled
                      className="form-input"
                      value={branchForm.username}
                      style={{ backgroundColor: 'var(--border-color)', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password Baru (Kosongkan jika tidak ingin diubah)</label>
                    <input 
                      type="text"
                      className="form-input"
                      placeholder="Masukkan password baru untuk mengganti password lama"
                      value={branchForm.password}
                      onChange={(e) => setBranchForm({ ...branchForm, password: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nama Cabang (Display Name)</label>
                    <input 
                      type="text"
                      required
                      className="form-input"
                      value={branchForm.displayName}
                      onChange={(e) => setBranchForm({ ...branchForm, displayName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lokasi / Kota Cabang</label>
                    <input 
                      type="text"
                      required
                      className="form-input"
                      value={branchForm.location}
                      onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" onClick={() => { setBranchModalOpen(false); setEditingBranch(null); setBranchForm({ username: '', password: '', displayName: '', location: '' }); }} className="btn btn-secondary">Batal</button>
                  <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Print Sticker Settings Modal */}
        {stickerModalOpen && (
          <div className="modal-overlay" style={{ zIndex: 999 }}>
            <div className="modal-content" style={{ maxWidth: '800px', width: '95%', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', padding: '24px' }}>
              {/* Left Column: Settings Form */}
              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="modal-header" style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <h3 className="section-title">Pengaturan Cetak Stiker</h3>
                  <button onClick={() => setStickerModalOpen(false)} className="close-btn">✕</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, overflowY: 'auto', maxHeight: '420px', paddingRight: '8px' }}>
                  {/* Row 1: Paper Dimensions */}
                  <div className="form-grid-two-columns">
                    <div className="form-group">
                      <label className="form-label">Lebar Kertas (mm)</label>
                      <input 
                        type="number"
                        min="10"
                        max="300"
                        className="form-input"
                        value={printSettings.paperWidth}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrintSettings({ ...printSettings, paperWidth: val === '' ? '' : (parseInt(val) || 0) });
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tinggi Kertas (mm)</label>
                      <input 
                        type="number"
                        min="5"
                        max="500"
                        className="form-input"
                        value={printSettings.paperHeight}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrintSettings({ ...printSettings, paperHeight: val === '' ? '' : (parseInt(val) || 0) });
                        }}
                      />
                    </div>
                  </div>

                  {/* Row 2: Label Dimensions */}
                  <div className="form-grid-two-columns">
                    <div className="form-group">
                      <label className="form-label">Lebar Label (mm)</label>
                      <input 
                        type="number"
                        min="10"
                        max="150"
                        className="form-input"
                        value={printSettings.width}
                        onChange={(e) => {
                          const val = e.target.value;
                          const w = val === '' ? '' : (parseInt(val) || 0);
                          const wCalc = w || 0;
                          setPrintSettings(prev => ({ 
                            ...prev, 
                            width: w, 
                            paperWidth: (prev.columns || 1) * wCalc + (prev.margin || 0) * 2 
                          }));
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tinggi Label (mm)</label>
                      <input 
                        type="number"
                        min="5"
                        max="100"
                        className="form-input"
                        value={printSettings.height}
                        onChange={(e) => {
                          const val = e.target.value;
                          const h = val === '' ? '' : (parseInt(val) || 0);
                          const hCalc = h || 0;
                          setPrintSettings(prev => ({ 
                            ...prev, 
                            height: h, 
                            paperHeight: (prev.rows || 1) * hCalc + (prev.margin || 0) * 2 
                          }));
                        }}
                      />
                    </div>
                  </div>

                  {/* Row 3: Grid (Columns & Rows) */}
                  <div className="form-grid-two-columns">
                    <div className="form-group">
                      <label className="form-label">Jumlah Kolom</label>
                      <input 
                        type="number"
                        min="1"
                        max="10"
                        className="form-input"
                        value={printSettings.columns}
                        onChange={(e) => {
                          const val = e.target.value;
                          const c = val === '' ? '' : (parseInt(val) || 0);
                          const cCalc = c || 0;
                          setPrintSettings(prev => ({ 
                            ...prev, 
                            columns: c, 
                            paperWidth: cCalc * (prev.width || 0) + (prev.margin || 0) * 2 
                          }));
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Jumlah Baris</label>
                      <input 
                        type="number"
                        min="1"
                        max="30"
                        className="form-input"
                        value={printSettings.rows}
                        onChange={(e) => {
                          const val = e.target.value;
                          const r = val === '' ? '' : (parseInt(val) || 0);
                          const rCalc = r || 0;
                          setPrintSettings(prev => ({ 
                            ...prev, 
                            rows: r, 
                            paperHeight: rCalc * (prev.height || 0) + (prev.margin || 0) * 2 
                          }));
                        }}
                      />
                    </div>
                  </div>

                  {/* Row 4: Margin & Font Size */}
                  <div className="form-grid-two-columns">
                    <div className="form-group">
                      <label className="form-label">Margin Kertas (mm)</label>
                      <input 
                        type="number"
                        min="0"
                        max="50"
                        className="form-input"
                        value={printSettings.margin}
                        onChange={(e) => {
                          const val = e.target.value;
                          const m = val === '' ? '' : (parseInt(val) || 0);
                          const mCalc = m || 0;
                          setPrintSettings(prev => ({ 
                            ...prev, 
                            margin: m, 
                            paperWidth: (prev.columns || 1) * (prev.width || 0) + mCalc * 2,
                            paperHeight: (prev.rows || 1) * (prev.height || 0) + mCalc * 2
                          }));
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ukuran Font (pt / Skala)</label>
                      <input 
                        type="number"
                        min="2"
                        max="24"
                        className="form-input"
                        value={printSettings.fontSize}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrintSettings({ ...printSettings, fontSize: val === '' ? '' : (parseInt(val) || 0) });
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: 'var(--bg-app)', borderRadius: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input 
                        type="checkbox"
                        checked={printSettings.showBarcode}
                        onChange={(e) => setPrintSettings({ ...printSettings, showBarcode: e.target.checked })}
                      />
                      Tampilkan Barcode Code 39
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input 
                        type="checkbox"
                        checked={printSettings.showProductInfo}
                        onChange={(e) => setPrintSettings({ ...printSettings, showProductInfo: e.target.checked })}
                      />
                      Tampilkan Nama & SKU Produk
                    </label>
                  </div>
                </div>

                <div className="modal-footer" style={{ padding: '12px 0 0 0', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setStickerModalOpen(false)} className="btn btn-secondary">Batal</button>
                  <button 
                    type="button" 
                    onClick={triggerStickerPrint} 
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    Cetak Sekarang ({stickersToPrint.length} Stiker)
                  </button>
                </div>
              </div>
              {/* Right Column: Live Interactive Preview */}
              <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'flex-start' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'left' }}>
                  Pratinjau Kertas ({printSettings.columns}x{printSettings.rows} Grid)
                </h4>
                
                <div style={{ width: '100%', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e1b18', borderRadius: '8px', padding: '20px', minHeight: '280px', overflow: 'auto' }}>
                  <div 
                    style={{ 
                      width: `${printSettings.paperWidth * 2.2}px`, 
                      height: `${printSettings.paperHeight * 2.2}px`, 
                      maxWidth: '100%',
                      maxHeight: '260px',
                      padding: `${printSettings.margin * 2.2}px`,
                      backgroundColor: 'white', 
                      color: 'black', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)', 
                      borderRadius: '4px', 
                      display: 'grid', 
                      gridTemplateColumns: `repeat(${printSettings.columns}, ${printSettings.width * 2.2}px)`,
                      gridTemplateRows: `repeat(${printSettings.rows}, ${printSettings.height * 2.2}px)`,
                      justifyContent: 'center',
                      alignContent: 'center',
                      gap: '2px',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      position: 'relative',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {(() => {
                      const pageSize = printSettings.columns * printSettings.rows;
                      const previewItems = [...stickersToPrint.slice(0, pageSize)];
                      while (previewItems.length < pageSize) {
                        previewItems.push({ 
                          sku: stickersToPrint[0]?.sku || 'SKU-XXXX', 
                          name: stickersToPrint[0]?.name || 'Nama Produk', 
                          sn: 'KOLOM-' + (previewItems.length + 1) 
                        });
                      }
                      return previewItems.map((item, idx) => (
                        <div 
                          key={idx}
                          style={{
                            width: `${printSettings.width * 2.2}px`,
                            height: `${printSettings.height * 2.2}px`,
                            boxSizing: 'border-box',
                            padding: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            border: '1px dashed #ccc'
                          }}
                        >
                          {printSettings.showProductInfo && (
                            <>
                              <div style={{ fontSize: `${printSettings.fontSize * 0.9 * 2.2}px`, fontWeight: '800', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.1, textAlign: 'center' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: `${printSettings.fontSize * 0.8 * 2.2}px`, fontFamily: 'monospace', fontWeight: '600', color: '#555', lineHeight: 1, width: '100%', textAlign: 'center' }}>
                                SKU: {item.sku}
                              </div>
                            </>
                          )}
                          {printSettings.showBarcode && (
                            <div style={{ width: '100%', height: '35%', margin: '2px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img 
                                src={generateCode39SVG(item.sn)} 
                                alt="barcode preview" 
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                            </div>
                          )}
                          <div style={{ fontSize: `${printSettings.fontSize * 2.2}px`, fontFamily: 'monospace', fontWeight: '800', borderTop: '1px dashed #ddd', width: '100%', paddingTop: '1px', marginTop: '1px', letterSpacing: '0.5px', textAlign: 'center' }}>
                            {item.sn}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'left' }}>
                  * Menampilkan pratinjau halaman pertama ({printSettings.columns}x{printSettings.rows} stiker). Total stiker yang akan dicetak: {stickersToPrint.length} stiker.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hidden Area specifically rendered for window.print() */}
        {createPortal(
          <div id="print-sticker-container">
            {(() => {
              const chunks = [];
              const pageSize = printSettings.columns * printSettings.rows;
              for (let i = 0; i < stickersToPrint.length; i += pageSize) {
                chunks.push(stickersToPrint.slice(i, i + pageSize));
              }
              return chunks.map((pageItems, pageIdx) => (
                <div 
                  key={pageIdx} 
                  className="print-sticker-page"
                  style={{ 
                    width: `${printSettings.paperWidth}mm`,
                    height: `${printSettings.paperHeight}mm`,
                    padding: `${printSettings.margin}mm`,
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-start',
                    alignContent: 'flex-start',
                    margin: 0,
                    pageBreakAfter: 'always',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    backgroundColor: '#fff'
                  }}
                >
                  {pageItems.map((sticker, idx) => (
                    <div 
                      key={idx} 
                      className="print-sticker-item"
                      style={{ 
                        width: `${printSettings.width}mm`, 
                        height: `${printSettings.height}mm`,
                        padding: '1mm',
                        margin: 0,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        width: '100%', 
                        height: '100%', 
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}>
                        {printSettings.showProductInfo && (
                          <>
                            <div style={{ fontSize: `${printSettings.fontSize * 0.9}pt`, fontWeight: '800', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.1, textTransform: 'uppercase', textAlign: 'center' }}>
                              {sticker.name}
                            </div>
                            <div style={{ fontSize: `${printSettings.fontSize * 0.8}pt`, fontFamily: 'monospace', fontWeight: '600', color: '#333', lineHeight: 1, width: '100%', textAlign: 'center' }}>
                              SKU: {sticker.sku}
                            </div>
                          </>
                        )}
                        {printSettings.showBarcode && (
                          <div style={{ width: '100%', height: '35%', margin: '1px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img 
                              src={generateCode39SVG(sticker.sn)} 
                              alt="barcode" 
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                            />
                          </div>
                        )}
                        <div style={{ fontSize: `${printSettings.fontSize}pt`, fontFamily: 'monospace', fontWeight: '800', width: '100%', borderTop: '0.2mm dashed #aaa', paddingTop: '0.2mm', marginTop: '0.2mm', letterSpacing: '0.5px', textAlign: 'center' }}>
                          {sticker.sn}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>,
          document.body
        )}

      </div>
    );
  }
