const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const supabase = require('../db/supabase')

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  console.log('Login attempt:', email)

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    console.log('Supabase response:', users, error)

    if (error || !users) {
      return res.status(400).json({ error: 'User not found', details: error })
    }

    const validPassword = await bcrypt.compare(password, users.password)
    console.log('Password valid:', validPassword)
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' })
    }

    const token = jwt.sign(
      { id: users.id, role: users.role, name: users.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        department: users.department
      }
    })
  } catch (err) {
    console.log('Catch error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET CURRENT USER
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, department, manager_id')
      .eq('id', req.user.id)
      .single()

    if (error) return res.status(400).json({ error })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router