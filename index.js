const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors({
  origin: ['http://localhost:3000', 'https://goal-tracker-fronten-82ocwbhek-goal-tracker-front.vercel.app'],
  credentials: true
}))
app.use(express.json())

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/goals', require('./routes/goals'))
app.use('/api/manager', require('./routes/manager'))
app.use('/api/admin', require('./routes/admin'))
app.use('/api/checkins', require('./routes/checkins'))

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Goal Tracker API running!' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
