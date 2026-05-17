const express = require('express')
const router = express.Router()
const supabase = require('../db/supabase')
const auth = require('../middleware/auth')

// Calculate score based on UoM type
const calculateScore = (uom_type, target, actual, target_date, actual_date) => {
  switch(uom_type) {
    case 'numeric_higher':
    case 'percentage_higher':
      return (actual / target) * 100

    case 'numeric_lower':
    case 'percentage_lower':
      return (target / actual) * 100

    case 'zero_based':
      return actual === 0 ? 100 : 0

    case 'timeline':
      if (!actual_date || !target_date) return 0
      return new Date(actual_date) <= new Date(target_date) ? 100 : 0

    default:
      return 0
  }
}

// LOG ACTUAL ACHIEVEMENT
router.post('/', auth, async (req, res) => {
  const { goal_id, quarter, actual, actual_date, status } = req.body

  try {
    // Check if window is open for this quarter
    const { data: window } = await supabase
      .from('cycle_windows')
      .select('*')
      .eq('period', quarter)
      .eq('is_active', true)
      .single()

    if (!window) {
      return res.status(400).json({ 
        error: `${quarter} check-in window is not open` 
      })
    }

    // Get goal details for score calculation
    const { data: goal } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goal_id)
      .single()

    if (!goal) {
      return res.status(400).json({ error: 'Goal not found' })
    }

    // Calculate score
    const score = calculateScore(
      goal.uom_type,
      goal.target,
      actual,
      goal.target_date,
      actual_date
    )

    // Check if checkin already exists for this quarter
    const { data: existing } = await supabase
      .from('check_ins')
      .select('id')
      .eq('goal_id', goal_id)
      .eq('quarter', quarter)
      .single()

    let data, error

    if (existing) {
      // Update existing
      const result = await supabase
        .from('check_ins')
        .update({ actual, actual_date, status, score })
        .eq('id', existing.id)
        .select()
      data = result.data
      error = result.error
    } else {
      // Create new
      const result = await supabase
        .from('check_ins')
        .insert({ goal_id, quarter, actual, actual_date, status, score })
        .select()
      data = result.data
      error = result.error
    }

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET MY CHECK-INS
router.get('/my', auth, async (req, res) => {
  try {
    const { data: goals } = await supabase
      .from('goals')
      .select('id')
      .eq('employee_id', req.user.id)

    const goalIds = goals.map(g => g.id)

    const { data, error } = await supabase
      .from('check_ins')
      .select('*, goals(title, target, uom_type, weightage)')
      .in('goal_id', goalIds)

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET CHECK-INS FOR A SPECIFIC GOAL
router.get('/goal/:goalId', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('goal_id', req.params.goalId)
      .order('quarter')

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router