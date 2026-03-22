import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import './App.css'; 

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } }, tooltip: { backgroundColor: 'rgba(17, 24, 39, 0.9)', titleColor: '#fff', bodyColor: '#fff' } }, scales: { x: { grid: { color: 'rgba(75, 85, 99, 0.2)' }, ticks: { color: '#9ca3af' } }, y: { grid: { color: 'rgba(75, 85, 99, 0.2)' }, ticks: { color: '#9ca3af' } } } };

const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; 

const Icons = {
    Dashboard: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
    History: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Inventory: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
    Trash: () => <svg width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
    Wifi: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>,
    Flame: () => <svg width="32" height="32" fill="none" stroke="#f97316" strokeWidth="2" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"></path></svg>
};

const TAG_DATABASE = { "E2:45:F1:A9": "Li-Po Pil (3.7V)", "12:A4:B5:C6": "Ağrı Kesici", "DEFAULT": "Tanımsız Cisim" };

function App() {
  const [activeTab, setActiveTab] = useState('live'); 
  const [device, setDevice] = useState(null);
  const [rxChar, setRxChar] = useState(null); 
  const [isConnected, setIsConnected] = useState(false);
  
  const [data, setData] = useState({ w: 0, t: 0, h: 0 }); 
  const [heaterMode, setHeaterMode] = useState('manual'); 
  const [targetTemp, setTargetTemp] = useState(25); 

  const [heaterStartTime, setHeaterStartTime] = useState(null);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const [liveDataPoints, setLiveDataPoints] = useState({ labels: [], weights: [], temps: [] });
  const [historyData, setHistoryData] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);

  

  const connectToBLE = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'ESP32_IoT_Sistemi' }],
        optionalServices: [SERVICE_UUID]
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      
      const txCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_TX);
      txCharacteristic.startNotifications();
      txCharacteristic.addEventListener('characteristicvaluechanged', handleReceiveData);
      
      const rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_RX);
      setRxChar(rxCharacteristic);

      setDevice(device);
      setIsConnected(true);
    } catch (error) { alert("Bağlantı başarısız."); }
  };

  const sendHeaterCommand = async (command) => {
    if (rxChar) {
      const encoder = new TextEncoder();
      await rxChar.writeValue(encoder.encode(command));
    }
  };

  const handleReceiveData = (event) => {
    const value = new TextDecoder().decode(event.target.value);
    try {
      const parsedData = JSON.parse(value);
      if (parsedData.w !== undefined) {
        setData({ w: parsedData.w, t: parsedData.t, h: parsedData.h });
        
        const timeNow = parsedData.ts ? new Date(parsedData.ts * 1000).toLocaleTimeString('tr-TR') : new Date().toLocaleTimeString('tr-TR');
        setLiveDataPoints(prev => ({ labels: [...prev.labels, timeNow].slice(-30), weights: [...prev.weights, parsedData.w].slice(-30), temps: [...prev.temps, parsedData.t].slice(-30) }));
      }
      if (parsedData.r) addToInventory(parsedData.r);
    } catch (e) { }
  };
  
  useEffect(() => {
    if (heaterMode === 'auto' && isConnected && rxChar) {
      if (data.t < targetTemp && data.h === 0) {
        sendHeaterCommand("H_ON");
      } else if (data.t >= targetTemp && data.h === 1) {
        sendHeaterCommand("H_OFF");
      }
    }
  }, [data.t, heaterMode, targetTemp, data.h, isConnected, rxChar]);

  useEffect(() => {
    let interval;
    if (data.h === 1) { 
      if (!heaterStartTime) setHeaterStartTime(Date.now()); 
      
      interval = setInterval(() => {
        const elapsedTime = Date.now() - heaterStartTime;
        if (elapsedTime >= 15 * 60 * 1000) { 
          setShowWarningModal(true);
        }
      }, 5000); 
    } else {
      setHeaterStartTime(null);
      setShowWarningModal(false);
    }
    return () => clearInterval(interval);
  }, [data.h, heaterStartTime]);

  const fetchHistory = async () => { try { const res = await axios.get('http://127.0.0.1:3001/api/history'); setHistoryData(res.data); } catch(e){} };
  const fetchInventory = async () => { try { const res = await axios.get('http://127.0.0.1:3001/api/inventory/list'); setInventoryList(res.data); } catch(e){} };
  const addToInventory = async (uid) => { const itemName = TAG_DATABASE[uid] || `Bilinmeyen Ürün (${uid})`; try { await axios.post('http://127.0.0.1:3001/api/inventory/add', {uid, itemName}); fetchInventory(); } catch(e){} };
  const deleteItem = async (id) => { if(window.confirm("Silinsin mi?")){ await axios.delete(`http://127.0.0.1:3001/api/inventory/delete/${id}`); fetchInventory();} };

  useEffect(() => { if (activeTab === 'history') fetchHistory(); if (activeTab === 'inventory') fetchInventory(); }, [activeTab]);

  return (
    <div className="app-layout">
      
      {/* 15 DAKİKA UYARI MODALI */}
      {showWarningModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2 style={{color: '#ef4444'}}>⚠️ Güvenlik Uyarısı</h2>
            <p>Her şey yolunda mı? Isıtıcının 15 dakikadır aralıksız açık olduğu görülüyor.</p>
            <div className="modal-actions">
              <button className="btn-safe" onClick={() => {
                 setHeaterStartTime(Date.now()); 
                 setShowWarningModal(false);
              }}>Sorun Yok (Devam Et)</button>
              
              <button className="btn-danger" onClick={() => {
                 sendHeaterCommand("H_OFF"); 
                 setHeaterMode('manual'); 
                 setShowWarningModal(false);
              }}>Isıtma İşlemini Durdur</button>
            </div>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <div className="logo-area"><div className="logo-icon">Lojistik</div> <span>Ünitesi</span></div>
        <nav className="nav-menu">
          <button className={`nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}><Icons.Dashboard /> Canlı Takip</button>
          <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}><Icons.History /> Geçmiş Veriler</button>
          <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}><Icons.Inventory /> Envanter</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="page-title"><h2>{activeTab === 'live' ? 'Sistem Paneli' : activeTab === 'history' ? 'Kayıtlar' : 'Envanter'}</h2></div>
          {!isConnected ? <button className="connect-btn" onClick={connectToBLE}><Icons.Wifi /> Cihaza Bağlan</button> : <span className="badge-connected">● Sistem Online</span>}
        </header>

        
        {activeTab === 'live' && (
          <div className="dashboard-view">
            <div className="heater-control-panel">
              <div className="heater-info">
                <div className={`icon-box ${data.h ? 'orange-glow' : ''}`}><Icons.Flame /></div>
                <div>
                  <h3>Endüstriyel Isıtıcı (12V)</h3>
                  <p>Durum: <strong style={{color: data.h ? '#f97316' : '#9ca3af'}}>{data.h ? 'AKTİF (Isıtıyor)' : 'KAPALI'}</strong></p>
                </div>
              </div>

              <div className="heater-actions">
                <div className="mode-selector">
                  <button className={heaterMode === 'manual' ? 'active' : ''} onClick={() => setHeaterMode('manual')}>Manuel</button>
                  <button className={heaterMode === 'auto' ? 'active' : ''} onClick={() => setHeaterMode('auto')}>Otomatik</button>
                </div>

                {heaterMode === 'auto' ? (
                  <div className="auto-settings">
                    <span>Tetikleme Isısı: <strong>{targetTemp}°C</strong></span>
                    <input type="range" min="0" max="80" value={targetTemp} onChange={(e) => setTargetTemp(e.target.value)} />
                    <small>Sıcaklık bunun altına düşünce otomatik açılır.</small>
                  </div>
                ) : (
                  <div className="manual-settings">
                    <button className="btn-turn-on" onClick={() => sendHeaterCommand("H_ON")} disabled={data.h === 1 || !isConnected}>🔥 AÇ</button>
                    <button className="btn-turn-off" onClick={() => sendHeaterCommand("H_OFF")} disabled={data.h === 0 || !isConnected}>❄️ KAPAT</button>
                  </div>
                )}
              </div>
            </div>

            <div className="cards-grid">
              <div className="stat-card"><div className="card-header">Ortam Sıcaklığı</div><div className="card-value">{data.t.toFixed(1)} <span className="unit">°C</span></div></div>
              <div className="stat-card"><div className="card-header">Canlı Ağırlık</div><div className="card-value">{data.w.toFixed(2)} <span className="unit">kg</span></div></div>
            </div>
            
            <div className="chart-container">
              <h3>Canlı Değişim Grafiği</h3>
              <div className="chart-wrapper">
                <Line options={chartOptions} data={{ labels: liveDataPoints.labels, datasets: [ { label: 'Ağırlık', data: liveDataPoints.weights, borderColor: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.1)', fill: true }, { label: 'Sıcaklık', data: liveDataPoints.temps, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true } ] }} />
              </div>
            </div>
          </div>
        )}
        
        {/* GEÇMİŞ VERİLER SEKMESİ */}
        {activeTab === 'history' && (
          <div className="history-view">
            <div className="panel-card">
              <h3>Geçmiş Sensör Kayıtları</h3>
              
              {historyData && historyData.length > 0 ? (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tarih / Saat</th>
                        <th>Sıcaklık (°C)</th>
                        <th>Ağırlık (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((item, index) => (
                        <tr key={index}>
                          <td>{item.createdAt ? new Date(item.createdAt).toLocaleString('tr-TR') : 'Bilinmeyen Zaman'}</td>
                          <td>{item.temperature}</td>
                          <td>{item.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon" style={{ opacity: 0.5, marginBottom: '1rem' }}>
                    <Icons.History />
                  </div>
                  <h4>Henüz Kayıt Yok</h4>
                  <p style={{ color: '#9ca3af', maxWidth: '400px', margin: '0 auto' }}>
                    {isConnected 
                      ? "ESP32 bağlı ancak henüz veritabanına yeni bir log düşmedi. Veriler gelmeye başladığında burada listelenecektir." 
                      : "Sistem şu an çevrimdışı. Veritabanında gösterilecek geçmiş veri bulunmuyor. Cihaza bağlanarak veya veritabanı bağlantınızı kontrol ederek veri akışını başlatabilirsiniz."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

       
        {activeTab === 'inventory' && (
          <div className="inventory-view">
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>Okunan Envanter (RFID/NFC)</h3>
                <span className="badge" style={{ background: '#374151', padding: '5px 10px', borderRadius: '12px', fontSize: '12px', color: '#fff' }}>
                  Toplam: {inventoryList.length} Ürün
                </span>
              </div>

              {inventoryList && inventoryList.length > 0 ? (
                <div className="inventory-grid">
                  {inventoryList.map((item) => (
                    <div key={item._id || item.id} className="inventory-item-card">
                      <div className="item-info">
                        <strong>{item.itemName}</strong>
                        <small style={{ color: '#9ca3af', display: 'block' }}>UID: {item.uid}</small>
                      </div>
                      <button className="btn-icon" onClick={() => deleteItem(item._id || item.id)} title="Sil">
                        <Icons.Trash />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon" style={{ opacity: 0.5, marginBottom: '1rem' }}>
                    <Icons.Inventory />
                  </div>
                  <h4>Envanter Boş</h4>
                  <p style={{ color: '#9ca3af', maxWidth: '400px', margin: '0 auto' }}>
                    {isConnected
                      ? "Sisteme henüz bir etiket veya cisim okutulmadı. Lütfen sensöre bir ürün yaklaştırın."
                      : "ESP32'ye bağlı değilsiniz. Geçmiş envanter verisi de bulunamadı. Lütfen sistemi aktif hale getirin."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;