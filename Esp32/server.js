const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 


const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
    .then(() => console.log(" MongoDB Atlas Bağlandı"))
    .catch(err => console.error(" Bağlantı Hatası", err));


const LogSchema = new mongoose.Schema({
    weight: Number,
    temp: Number,
    date: { type: Date, default: Date.now }
});
const SensorLog = mongoose.model('SensorLog', LogSchema);


const InventorySchema = new mongoose.Schema({
    uid: String,     
    itemName: String,  
    addedAt: { type: Date, default: Date.now }
});
const Inventory = mongoose.model('Inventory', InventorySchema);


app.post('/api/save', async (req, res) => {
    try {
        const { weight, temp } = req.body;
        const newLog = new SensorLog({ weight, temp });
        await newLog.save();
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ date: -1 }).limit(50);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/inventory/add', async (req, res) => {
    try {
        const { uid, itemName } = req.body;
        
       
        const existing = await Inventory.findOne({ uid });
        if(existing) {
             return res.json({ status: 'exists', message: 'Bu ürün zaten ekli' });
        }
        
        const newItem = new Inventory({ uid, itemName });
        await newItem.save();
        res.json({ status: 'success', data: newItem });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/inventory/list', async (req, res) => {
    try {
        const items = await Inventory.find().sort({ addedAt: -1 });
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.delete('/api/inventory/delete/:id', async (req, res) => {
    try {
        await Inventory.findByIdAndDelete(req.params.id);
        res.json({ status: 'deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));