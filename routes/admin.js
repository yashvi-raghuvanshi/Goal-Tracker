const express = require('express')
const router = express.Router()
const supabase = require('../db/supabase')
const auth = require('../middleware/auth')

// MIDDLEWARE — admin only
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// GET ALL GOALS
router.get('/all-goals', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')

    if (error) {
      console.log('all-goals error:', error)
      return res.status(400).json({ error })
    }
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET ALL USERS
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, department, manager_id')

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ADD USER
router.post('/users', auth, adminOnly, async (req, res) => {
  const { name, email, password, role, department, manager_id } = req.body
  const bcrypt = require('bcryptjs')
  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const { data, error } = await supabase
      .from('users')
      .insert({ name, email, password: hashedPassword, role, department, manager_id })
      .select()

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET CYCLE WINDOWS
router.get('/cycles', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cycle_windows')
      .select('*')
      .order('window_open')

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// UPDATE CYCLE WINDOW
router.put('/cycles/:id', auth, adminOnly, async (req, res) => {
  const { window_open, window_close, is_active } = req.body
  try {
    const { data, error } = await supabase
      .from('cycle_windows')
      .update({ window_open, window_close, is_active })
      .eq('id', req.params.id)
      .select()

    await supabase.from('audit_logs').insert({
      user_id: req.user.id,
      action: 'updated_cycle_window',
      table_name: 'cycle_windows',
      record_id: req.params.id,
      new_value: { window_open, window_close, is_active }
    })

    if (error) return res.status(400).json({ error })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// UNLOCK GOAL
router.put('/unlock/:goalId', auth, adminOnly, async (req, res) => {
  const { reason } = req.body
  try {
    const { data: goal } = await supabase
      .from('goals')
      .select('*')
      .eq('id', req.params.goalId)
      .single()

    const { error } = await supabase
      .from('goals')
      .update({ is_locked: false, status: 'draft' })
      .eq('id', req.params.goalId)

    await supabase.from('audit_logs').insert({
      user_id: req.user.id,
      action: 'unlocked_goal',
      table_name: 'goals',
      record_id: req.params.goalId,
      old_value: { is_locked: true },
      new_value: { is_locked: false, reason }
    })

    if (error) return res.status(400).json({ error })
    res.json({ message: 'Goal unlocked successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET AUDIT LOGS
router.get('/audit', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, users(name)')
      .order('created_at', { ascending: false })

    if (error) return res.status(400).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET COMPLETION DASHBOARD
router.get('/completion', auth, adminOnly, async (req, res) => {
  try {
    const { data: employees, error } = await supabase
      .from('users')
      .select('id, name, department')
      .eq('role', 'employee')

    if (error) {
      console.log('completion error:', error)
      return res.status(400).json({ error })
    }

    const results = await Promise.all(employees.map(async (emp) => {
      const { data: goals } = await supabase
        .from('goals')
        .select('status')
        .eq('employee_id', emp.id)

      const { data: checkins } = await supabase
        .from('check_ins')
        .select('id')

      return {
        employee: emp.name,
        department: emp.department,
        goals_submitted: goals?.filter(g => g.status !== 'draft').length || 0,
        goals_approved: goals?.filter(g => g.status === 'approved').length || 0,
        total_goals: goals?.length || 0,
        checkins_done: checkins?.length || 0
      }
    }))

    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// EXPORT CSV
router.get('/export', auth, adminOnly, async (req, res) => {
  try {
    const { data: goals } = await supabase
      .from('goals')
      .select('*, users(name, department), thrust_areas(name)')

    const { data: checkins } = await supabase
      .from('check_ins')
      .select('*')

    // Build CSV
    let csv = 'Employee,Department,Goal Title,UoM,Target,Weightage,Status,Q1 Actual,Q2 Actual,Q3 Actual,Q4 Actual\n'

    goals.forEach(goal => {
      const goalCheckins = checkins.filter(c => c.goal_id === goal.id)
      const q1 = goalCheckins.find(c => c.quarter === 'Q1')?.actual || ''
      const q2 = goalCheckins.find(c => c.quarter === 'Q2')?.actual || ''
      const q3 = goalCheckins.find(c => c.quarter === 'Q3')?.actual || ''
      const q4 = goalCheckins.find(c => c.quarter === 'Q4')?.actual || ''

      csv += `${goal.users?.name},${goal.users?.department},${goal.title},${goal.uom_type},${goal.target},${goal.weightage}%,${goal.status},${q1},${q2},${q3},${q4}\n`
    })

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=achievement-report.csv')
    res.send(csv)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUSH SHARED GOAL
router.post('/shared-goal', auth, adminOnly, async (req, res) => {
  const { title, description, uom_type, target, employee_ids, primary_owner_id } = req.body
  try {
    // Create the main goal
    const { data: goal, error } = await supabase
      .from('goals')
      .insert({
        employee_id: primary_owner_id,
        title,
        description,
        uom_type,
        target,
        weightage: 0,
        is_shared: true,
        primary_owner_id,
        status: 'approved',
        is_locked: true
      })
      .select()

    if (error) return res.status(400).json({ error })

    // Link to all employees
    const sharedGoalRows = employee_ids.map(empId => ({
      goal_id: goal[0].id,
      employee_id: empId,
      weightage: 0
    }))

    await supabase.from('shared_goals').insert(sharedGoalRows)

    res.json({ message: 'Shared goal pushed successfully', goal: goal[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router