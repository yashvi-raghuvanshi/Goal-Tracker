const express = require('express')
const router = express.Router()
const supabase = require('../db/supabase')
const auth = require('../middleware/auth')

// MIDDLEWARE — only managers can access these routes
const managerOnly = (req, res, next) => {
  if (req.user.role !== 'manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Manager access required' })
  }
  next()
}

// GET ALL TEAM MEMBERS
router.get('/team', auth, managerOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, department')
      .eq('manager_id', req.user.id)

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET ONE EMPLOYEE'S GOALS
router.get('/goals/:employeeId', auth, managerOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*, thrust_areas(name)')
      .eq('employee_id', req.params.employeeId)

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// APPROVE GOALS — locks them
router.put('/approve/:employeeId', auth, managerOnly, async (req, res) => {
  try {
    // Check total weightage first
    const { data: goals } = await supabase
      .from('goals')
      .select('weightage')
      .eq('employee_id', req.params.employeeId)
      .eq('status', 'submitted')

    if (goals.length === 0) {
      return res.status(400).json({ error: 'No submitted goals found' })
    }

    const total = goals.reduce((sum, g) => sum + g.weightage, 0)
    if (total !== 100) {
      return res.status(400).json({ error: `Total weightage is ${total}%, must be 100%` })
    }

    // Approve and lock all submitted goals
    const { error } = await supabase
      .from('goals')
      .update({ status: 'approved', is_locked: true })
      .eq('employee_id', req.params.employeeId)
      .eq('status', 'submitted')

    // Log to audit
    await supabase.from('audit_logs').insert({
      user_id: req.user.id,
      action: 'approved_goals',
      table_name: 'goals',
      new_value: { employee_id: req.params.employeeId }
    })

    if (error) return res.status(400).json({ error })
    res.json({ message: 'Goals approved and locked successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// RETURN GOALS FOR REWORK
router.put('/return/:employeeId', auth, managerOnly, async (req, res) => {
  const { comment } = req.body
  try {
    const { error } = await supabase
      .from('goals')
      .update({ status: 'returned' })
      .eq('employee_id', req.params.employeeId)
      .eq('status', 'submitted')

    // Log to audit
    await supabase.from('audit_logs').insert({
      user_id: req.user.id,
      action: 'returned_goals',
      table_name: 'goals',
      new_value: { employee_id: req.params.employeeId, comment }
    })

    if (error) return res.status(400).json({ error })
    res.json({ message: 'Goals returned for rework' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// EDIT GOAL INLINE (during approval)
router.put('/edit-goal/:goalId', auth, managerOnly, async (req, res) => {
  const { target, weightage } = req.body
  try {
    const { data, error } = await supabase
      .from('goals')
      .update({ target, weightage })
      .eq('id', req.params.goalId)
      .select()

    // Log to audit
    await supabase.from('audit_logs').insert({
      user_id: req.user.id,
      action: 'edited_goal',
      table_name: 'goals',
      record_id: req.params.goalId,
      new_value: { target, weightage }
    })

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ADD CHECK-IN COMMENT
router.post('/checkin/:goalId', auth, managerOnly, async (req, res) => {
  const { quarter, manager_comment } = req.body
  try {
    const { data, error } = await supabase
      .from('check_ins')
      .update({ manager_comment })
      .eq('goal_id', req.params.goalId)
      .eq('quarter', quarter)
      .select()

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET TEAM CHECK-IN STATUS
router.get('/checkin-status', auth, managerOnly, async (req, res) => {
  try {
    const { data: team } = await supabase
      .from('users')
      .select('id, name')
      .eq('manager_id', req.user.id)

    const results = await Promise.all(team.map(async (member) => {
      const { data: checkins } = await supabase
        .from('check_ins')
        .select('quarter, status')
        .eq('goal_id', member.id)

      return {
        employee: member.name,
        employee_id: member.id,
        checkins
      }
    }))

    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router