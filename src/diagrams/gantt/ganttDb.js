import moment from 'moment'
import { logger } from '../../logger'

var dateFormat = ''
var title = ''
var sections = []
var tasks = []
var currentSection = ''

module.exports.clear = function () {
  sections = []
  tasks = []
  currentSection = ''
  title = ''
  taskCnt = 0
  lastTask = undefined
  lastTaskID = undefined
  rawTasks = []
}

module.exports.setDateFormat = function (txt) {
  dateFormat = txt
}

module.exports.getDateFormat = function () {
  return dateFormat
}
module.exports.setTitle = function (txt) {
  title = txt
}

module.exports.getTitle = function () {
  return title
}

module.exports.addSection = function (txt) {
  currentSection = txt
  sections.push(txt)
}

module.exports.getTasks = function () {
  var allItemsPricessed = compileTasks()
  var maxDepth = 10
  var iterationCount = 0
  while (!allItemsPricessed && (iterationCount < maxDepth)) {
    allItemsPricessed = compileTasks()
    iterationCount++
  }

  tasks = rawTasks

  return tasks
}

var getStartDate = function (prevTime, dateFormat, str) {
  str = str.trim()

  // Test for after
  var re = /^after\s+([\d\w-]+)/
  var afterStatement = re.exec(str.trim())

  if (afterStatement !== null) {
    var task = module.exports.findTaskById(afterStatement[1])

    if (typeof task === 'undefined') {
      var dt = new Date()
      dt.setHours(0, 0, 0, 0)
      return dt
    }
    return task.endTime
  }

  // Check for actual date set
  if (moment(str, dateFormat.trim(), true).isValid()) {
    return moment(str, dateFormat.trim(), true).toDate()
  } else {
    logger.debug('Invalid date:' + str)
    logger.debug('With date format:' + dateFormat.trim())
  }

  // Default date - now
  return new Date()
}

var getEndDate = function (prevTime, dateFormat, str) {
  str = str.trim()

  // Check for actual date
  if (moment(str, dateFormat.trim(), true).isValid()) {
    return moment(str, dateFormat.trim()).toDate()
  }

  var d = moment(prevTime)
  // Check for length
  var re = /^([\d]+)([wdhms])/
  var durationStatement = re.exec(str.trim())

  if (durationStatement !== null) {
    switch (durationStatement[2]) {
      case 's':
        d.add(durationStatement[1], 'seconds')
        break
      case 'm':
        d.add(durationStatement[1], 'minutes')
        break
      case 'h':
        d.add(durationStatement[1], 'hours')
        break
      case 'd':
        d.add(durationStatement[1], 'days')
        break
      case 'w':
        d.add(durationStatement[1], 'weeks')
        break
    }
    return d.toDate()
  }
  // Default date - now
  return d.toDate()
}

var taskCnt = 0
var parseId = function (idStr) {
  if (typeof idStr === 'undefined') {
    taskCnt = taskCnt + 1
    return 'task' + taskCnt
  }
  return idStr
}
// id, startDate, endDate
// id, startDate, length
// id, after x, endDate
// id, after x, length
// startDate, endDate
// startDate, length
// after x, endDate
// after x, length
// endDate
// length

var compileData = function (prevTask, dataStr) {
  var ds

  if (dataStr.substr(0, 1) === ':') {
    ds = dataStr.substr(1, dataStr.length)
  } else {
    ds = dataStr
  }

  var data = ds.split(',')

  var task = {}
  var df = module.exports.getDateFormat()

  // Get tags like active, done cand crit
  var matchFound = true
  while (matchFound) {
    matchFound = false
    if (data[0].match(/^\s*active\s*$/)) {
      task.active = true
      data.shift(1)
      matchFound = true
    }
    if (data[0].match(/^\s*done\s*$/)) {
      task.done = true
      data.shift(1)
      matchFound = true
    }
    if (data[0].match(/^\s*crit\s*$/)) {
      task.crit = true
      data.shift(1)
      matchFound = true
    }
  }
  var i
  for (i = 0; i < data.length; i++) {
    data[i] = data[i].trim()
  }

  switch (data.length) {
    case 1:
      task.id = parseId()
      task.startTime = prevTask.endTime
      task.endTime = getEndDate(task.startTime, df, data[0])
      break
    case 2:
      task.id = parseId()
      task.startTime = getStartDate(undefined, df, data[0])
      task.endTime = getEndDate(task.startTime, df, data[1])
      break
    case 3:
      task.id = parseId(data[0])
      task.startTime = getStartDate(undefined, df, data[1])
      task.endTime = getEndDate(task.startTime, df, data[2])
      break
    default:
  }

  return task
}

var parseData = function (prevTaskId, dataStr) {
  var ds

  if (dataStr.substr(0, 1) === ':') {
    ds = dataStr.substr(1, dataStr.length)
  } else {
    ds = dataStr
  }

  var data = ds.split(',')

  var task = {}

  // Get tags like active, done cand crit
  var matchFound = true
  while (matchFound) {
    matchFound = false
    if (data[0].match(/^\s*active\s*$/)) {
      task.active = true
      data.shift(1)
      matchFound = true
    }
    if (data[0].match(/^\s*done\s*$/)) {
      task.done = true
      data.shift(1)
      matchFound = true
    }
    if (data[0].match(/^\s*crit\s*$/)) {
      task.crit = true
      data.shift(1)
      matchFound = true
    }
  }
  var i
  for (i = 0; i < data.length; i++) {
    data[i] = data[i].trim()
  }

  switch (data.length) {
    case 1:
      task.id = parseId()
      task.startTime = { type: 'prevTaskEnd', id: prevTaskId }
      task.endTime = { data: data[0] }
      break
    case 2:
      task.id = parseId()
      task.startTime = { type: 'getStartDate', startData: data[0] }
      task.endTime = { data: data[1] }
      break
    case 3:
      task.id = parseId(data[0])
      task.startTime = { type: 'getStartDate', startData: data[1] }
      task.endTime = { data: data[2] }
      break
    default:
  }

  return task
}

var lastTask
var lastTaskID
var rawTasks = []
var taskDb = {}
module.exports.addTask = function (descr, data) {
  var rawTask = {
    section: currentSection,
    type: currentSection,
    processed: false,
    raw: { data: data },
    task: descr
  }
  var taskInfo = parseData(lastTaskID, data)
  rawTask.raw.startTime = taskInfo.startTime
  rawTask.raw.endTime = taskInfo.endTime
  rawTask.id = taskInfo.id
  rawTask.prevTaskId = lastTaskID
  rawTask.active = taskInfo.active
  rawTask.done = taskInfo.done
  rawTask.crit = taskInfo.crit

  var pos = rawTasks.push(rawTask)

  lastTaskID = rawTask.id
  // Store cross ref
  taskDb[rawTask.id] = pos - 1
}

module.exports.findTaskById = function (id) {
  var pos = taskDb[id]
  return rawTasks[pos]
}

module.exports.addTaskOrg = function (descr, data) {
  var newTask = {
    section: currentSection,
    type: currentSection,
    description: descr,
    task: descr
  }
  var taskInfo = compileData(lastTask, data)
  newTask.startTime = taskInfo.startTime
  newTask.endTime = taskInfo.endTime
  newTask.id = taskInfo.id
  newTask.active = taskInfo.active
  newTask.done = taskInfo.done
  newTask.crit = taskInfo.crit
  lastTask = newTask
  tasks.push(newTask)
}

var compileTasks = function () {
  var df = module.exports.getDateFormat()

  var compileTask = function (pos) {
    var task = rawTasks[pos]
    var startTime = ''
    switch (rawTasks[pos].raw.startTime.type) {
      case 'prevTaskEnd':
        var prevTask = module.exports.findTaskById(task.prevTaskId)
        task.startTime = prevTask.endTime
        break
      case 'getStartDate':
        startTime = getStartDate(undefined, df, rawTasks[pos].raw.startTime.startData)
        if (startTime) {
          rawTasks[pos].startTime = startTime
        }
        break
    }

    if (rawTasks[pos].startTime) {
      rawTasks[pos].endTime = getEndDate(rawTasks[pos].startTime, df, rawTasks[pos].raw.endTime.data)
      if (rawTasks[pos].endTime) {
        rawTasks[pos].processed = true
      }
    }

    return rawTasks[pos].processed
  }

  var i
  var allProcessed = true
  for (i = 0; i < rawTasks.length; i++) {
    compileTask(i)

    allProcessed = allProcessed && rawTasks[i].processed
  }
  return allProcessed
}
