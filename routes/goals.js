const express = require('express')
const router = express.Router()
const supabase = require('../db/supabase')
const auth = require('../middleware/auth')

// GET MY GOALS
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*, thrust_areas(name)')
      .eq('employee_id', req.user.id)

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// CREATE GOAL
router.post('/', auth, async (req, res) => {
  const { title, description, thrust_area_id, uom_type, target, target_date, weightage } = req.body

  try {
    // Check max 8 goals
    const { data: existing } = await supabase
      .from('goals')
      .select('id')
      .eq('employee_id', req.user.id)

    if (existing.length >= 8) {
      return res.status(400).json({ error: 'Maximum 8 goals allowed' })
    }

    // Check min weightage
    if (weightage < 10) {
      return res.status(400).json({ error: 'Minimum weightage is 10%' })
    }

    // Check total won't exceed 100
    const currentTotal = existing.reduce((sum, g) => sum + g.weightage, 0)
    if (currentTotal + weightage > 100) {
      return res.status(400).json({ 
        error: `Adding this would exceed 100%. You have ${100 - currentTotal}% remaining to allocate` 
      })
    }

    const { data, error } = await supabase
      .from('goals')
      .insert({
        employee_id: req.user.id,
        title,
        description,
        thrust_area_id,
        uom_type,
        target,
        target_date,
        weightage,
        status: 'draft'
      })
      .select()

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// UPDATE GOAL
router.put('/:id', auth, async (req, res) => {
  const { title, description, thrust_area_id, uom_type, target, target_date, weightage } = req.body

  try {
    // Check if goal is locked
    const { data: goal } = await supabase
      .from('goals')
      .select('is_locked, employee_id')
      .eq('id', req.params.id)
      .single()

    if (goal.is_locked) {
      return res.status(400).json({ error: 'Goal is locked: Cannot edit' })
    }

    if (goal.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your goal!' })
    }

    const { data, error } = await supabase
      .from('goals')
      .update({ title, description, thrust_area_id, uom_type, target, target_date, weightage })
      .eq('id', req.params.id)
      .select()

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE GOAL
router.delete('/:id', auth, async (req, res) => {
  try {
    const { data: goal } = await supabase
      .from('goals')
      .select('is_locked, employee_id')
      .eq('id', req.params.id)
      .single()

    if (goal.is_locked) {
      return res.status(400).json({ error: 'Goal is locked: Cannot delete' })
    }

    if (goal.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your goal!' })
    }

    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', req.params.id)

    if (error) return res.status(400).json({ error })
    res.json({ message: 'Goal deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// SUBMIT ALL GOALS
router.post('/submit', auth, async (req, res) => {
  try {
    // Get all my goals
    const { data: goals } = await supabase
      .from('goals')
      .select('weightage')
      .eq('employee_id', req.user.id)
      .eq('status', 'draft')

    if (goals.length === 0) {
      return res.status(400).json({ error: 'No goals to submit' })
    }

    // Check total weightage = 100
    const total = goals.reduce((sum, g) => sum + g.weightage, 0)
    if (total !== 100) {
      return res.status(400).json({ error: `Total weightage is ${total}%, must be 100%` })
    }

    // Submit all goals
    const { error } = await supabase
      .from('goals')
      .update({ status: 'submitted' })
      .eq('employee_id', req.user.id)
      .eq('status', 'draft')

    if (error) return res.status(400).json({ error })
    res.json({ message: 'Goals submitted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// CREATE NEW THRUST AREA
router.post('/thrust-areas', auth, async (req, res) => {
  const { name } = req.body
  try {
    const { data, error } = await supabase
      .from('thrust_areas')
      .insert({ name })
      .select()

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET THRUST AREAS
router.get('/thrust-areas', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('thrust_areas')
      .select('*')

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router