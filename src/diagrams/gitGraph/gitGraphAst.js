import _ from 'lodash'

import { logger } from '../../logger'

var commits = {}
var head = null
var branches = { 'master': head }
var curBranch = 'master'
var direction = 'LR'
var seq = 0

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function getId () {
  var pool = '0123456789abcdef'
  var id = ''
  for (var i = 0; i < 7; i++) {
    id += pool[getRandomInt(0, 16)]
  }
  return id
}

function isfastforwardable (currentCommit, otherCommit) {
  logger.debug('Entering isfastforwardable:', currentCommit.id, otherCommit.id)
  while (currentCommit.seq <= otherCommit.seq && currentCommit !== otherCommit) {
    // only if other branch has more commits
    if (otherCommit.parent == null) break
    if (Array.isArray(otherCommit.parent)) {
      logger.debug('In merge commit:', otherCommit.parent)
      return isfastforwardable(currentCommit, commits[otherCommit.parent[0]]) ||
        isfastforwardable(currentCommit, commits[otherCommit.parent[1]])
    } else {
      otherCommit = commits[otherCommit.parent]
    }
  }
  logger.debug(currentCommit.id, otherCommit.id)
  return currentCommit.id === otherCommit.id
}

function isReachableFrom (currentCommit, otherCommit) {
  var currentSeq = currentCommit.seq
  var otherSeq = otherCommit.seq
  if (currentSeq > otherSeq) return isfastforwardable(otherCommit, currentCommit)
  return false
}

module.exports.setDirection = function (dir) {
  direction = dir
}
var options = {}
module.exports.setOptions = function (rawOptString) {
  logger.debug('options str', rawOptString)
  rawOptString = rawOptString && rawOptString.trim()
  rawOptString = rawOptString || '{}'
  try {
    options = JSON.parse(rawOptString)
  } catch (e) {
    logger.error('error while parsing gitGraph options', e.message)
  }
}

module.exports.getOptions = function () {
  return options
}

module.exports.commit = function (msg) {
  var commit = {
    id: getId(),
    message: msg,
    seq: seq++,
    parent: head == null ? null : head.id
  }
  head = commit
  commits[commit.id] = commit
  branches[curBranch] = commit.id
  logger.debug('in pushCommit ' + commit.id)
}

module.exports.branch = function (name) {
  branches[name] = head != null ? head.id : null
  logger.debug('in createBranch')
}

module.exports.merge = function (otherBranch) {
  var currentCommit = commits[branches[curBranch]]
  var otherCommit = commits[branches[otherBranch]]
  if (isReachableFrom(currentCommit, otherCommit)) {
    logger.debug('Already merged')
    return
  }
  if (isfastforwardable(currentCommit, otherCommit)) {
    branches[curBranch] = branches[otherBranch]
    head = commits[branches[curBranch]]
  } else {
    // create merge commit
    var commit = {
      id: getId(),
      message: 'merged branch ' + otherBranch + ' into ' + curBranch,
      seq: seq++,
      parent: [head == null ? null : head.id, branches[otherBranch]]
    }
    head = commit
    commits[commit.id] = commit
    branches[curBranch] = commit.id
  }
  logger.debug(branches)
  logger.debug('in mergeBranch')
}

module.exports.checkout = function (branch) {
  logger.debug('in checkout')
  curBranch = branch
  var id = branches[curBranch]
  head = commits[id]
}

module.exports.reset = function (commitRef) {
  logger.debug('in reset', commitRef)
  var ref = commitRef.split(':')[0]
  var parentCount = parseInt(commitRef.split(':')[1])
  var commit = ref === 'HEAD' ? head : commits[branches[ref]]
  logger.debug(commit, parentCount)
  while (parentCount > 0) {
    commit = commits[commit.parent]
    parentCount--
    if (!commit) {
      var err = 'Critical error - unique parent commit not found during reset'
      logger.error(err)
      throw err
    }
  }
  head = commit
  branches[curBranch] = commit.id
}

function upsert (arr, key, newval) {
  const index = arr.indexOf(key)
  if (index === -1) {
    arr.push(newval)
  } else {
    arr.splice(index, 1, newval)
  }
}

function prettyPrintCommitHistory (commitArr) {
  var commit = _.maxBy(commitArr, 'seq')
  var line = ''
  commitArr.forEach(function (c) {
    if (c === commit) {
      line += '\t*'
    } else {
      line += '\t|'
    }
  })
  var label = [line, commit.id, commit.seq]
  _.each(branches, function (value, key) {
    if (value === commit.id) label.push(key)
  })
  logger.debug(label.join(' '))
  if (Array.isArray(commit.parent)) {
    var newCommit = commits[commit.parent[0]]
    upsert(commitArr, commit, newCommit)
    commitArr.push(commits[commit.parent[1]])
  } else if (commit.parent == null) {
    return
  } else {
    var nextCommit = commits[commit.parent]
    upsert(commitArr, commit, nextCommit)
  }
  commitArr = _.uniqBy(commitArr, 'id')
  prettyPrintCommitHistory(commitArr)
}

module.exports.prettyPrint = function () {
  logger.debug(commits)
  var node = module.exports.getCommitsArray()[0]
  prettyPrintCommitHistory([node])
}

module.exports.clear = function () {
  commits = {}
  head = null
  branches = { 'master': head }
  curBranch = 'master'
  seq = 0
}

module.exports.getBranchesAsObjArray = function () {
  const branchArr = _.map(branches, function (value, key) {
    return { 'name': key, 'commit': commits[value] }
  })
  return branchArr
}

module.exports.getBranches = function () { return branches }
module.exports.getCommits = function () { return commits }
module.exports.getCommitsArray = function () {
  var commitArr = Object.keys(commits).map(function (key) {
    return commits[key]
  })
  commitArr.forEach(function (o) { logger.debug(o.id) })
  return _.orderBy(commitArr, ['seq'], ['desc'])
}
module.exports.getCurrentBranch = function () { return curBranch }
module.exports.getDirection = function () { return direction }
module.exports.getHead = function () { return head }
