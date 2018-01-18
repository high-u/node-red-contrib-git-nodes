module.exports = function (RED) {
  'use strict'

  var fs = require('fs-extra')
  var execSync = require('child_process').execSync
  var node;

  function gitNodesNode(n) {

    RED.nodes.createNode(this, n)
    this.username = n.username
    this.email = n.email
    this.git = n.git
    this.gitrmcache = n.gitrmcache
    this.gitadd = n.gitadd
    this.debugging = n.debugging
    node = this
  }
  RED.nodes.registerType('git-nodes', gitNodesNode)

  RED.httpAdmin.post("/git-nodes/:id", RED.auth.needsPermission("git-nodes.write"), function(req,res) {
    var addminNode = RED.nodes.getNode(req.params.id);
    if (addminNode != null) {      
      addminNode.receive();

      var userDir = ''
      if (RED.settings.userDir) {
        userDir = RED.settings.userDir
      }
      else {
        userDir = process.env.HOME + '/.node-red'
      }

      var flowFile = ''
      if (RED.settings.flowFile) {
        flowFile = RED.settings.flowFile
      }
      else {
        flowFile = 'flows_'+require('os').hostname()+'.json'
      }
      // get flows.json
      var flowsFilePath = userDir + '/' + flowFile

      var flowsJson = fs.readFileSync(flowsFilePath, 'utf-8')
      
      if (fs.pathExistsSync(RED.settings.userDir + '/nodes')) {
        // remove nodes files
        fs.emptyDirSync(RED.settings.userDir + '/nodes')
      }
      else {
        // make dir
        fs.mkdirsSync(RED.settings.userDir + '/nodes')
      }
      // make nodes files
      var flowsObj = JSON.parse(flowsJson)
      flowsObj.forEach(function (value) {
        fs.mkdirsSync(RED.settings.userDir + '/nodes/' + value.id)
        Object.keys(value).forEach(function (key) {
          fs.writeFileSync(RED.settings.userDir + '/nodes/' + value.id + '/' + key, value[key])
        })
      })
      var cmd = ''

      // docker の時、ssh だとちょっと困ったので
      // https://qiita.com/azusanakano/items/8dc1d7e384b00239d4d9
      // ~/.netrc
      // machine github.com
      // login username
      // password xxxxxxx
      //
      // process.env.HOME
      // https://github.com/high-u/node-red-test-git.git

      var test = 'https://github.com/high-u/node-red-test-git.git'
      var re = /(^https:\/\/)([a-zA-Z.]+)/
      var gitService = re.exec(test)[2]
      console.log(gitService)

      var netrc = [
        'machine ' + gitService,
        'login ' + process.env.GIT_HTTPS_USER,
        'password ' + process.env.GIT_HTTPS_PW
      ].join('\n')
      fs.writeFileSync(process.env.HOME + '/.netrc', netrc)

      // git init
      cmd = [
        'cd ' + RED.settings.userDir,
        '[ -e "./.git" ] && : || git init'
      ].join(';')
      execSync(cmd)

      // git remote add origin
      if (node.git) {
        cmd = [
          'cd ' + RED.settings.userDir,
          'LEN=`git remote`',
          '[ ${#LEN} -eq 0 ] && git remote add origin ' + node.git + ' || :'
        ].join(';')
        execSync(cmd)
      }

      // git config --local user.name
      if (node.username) {
        cmd = [
          'cd ' + RED.settings.userDir,
          'git config --local user.name "' + node.username + '"'
        ].join(';')
        execSync(cmd)
      }

      // git config --local user.email
      if (node.email) {
        cmd = [
          'cd ' + RED.settings.userDir,
          'git config --local user.email "' + node.email + '"'
        ].join(';')
        execSync(cmd)
      }

      // git add flows
      cmd = [
        'cd ' + RED.settings.userDir,
        'git add ' + flowsFilePath,
        'git add ' + 'nodes',
      ].join(';')
      execSync(cmd)

      // git add
      if (node.gitadd) {
        var gitaddList = node.gitadd.split(',')
        var gitadd = gitaddList.map(function(x){
          return 'git add ' + x;
        });
        gitadd.unshift('cd ' + RED.settings.userDir);
        cmd = gitadd.join(';')
        execSync(cmd)
      }

      // git rm --cached
      if (node.gitrmcache) {
        var gitrmcacheList = node.gitrmcache.split(',')
        var gitrm = gitrmcacheList.map(function(x){
          return 'git rm --cached ' + x;
        });
        gitrm.unshift('cd ' + RED.settings.userDir);
        cmd = gitrm.join(';')
        execSync(cmd)
      }
      
      // git status
      cmd = [
        'cd ' + RED.settings.userDir,
        'git status --untracked-files=no',
      ].join(';')
      var gitStatus = execSync(cmd).toString()
      
      var gitCommit = ''
      var gitPush = ''
      try {
        // git commit
        cmd = [
          'cd ' + RED.settings.userDir,
          'git commit -m "' + req.body.commitMessage + '"',
        ].join(';')
        gitCommit = execSync(cmd).toString()

        // git push
        if (node.git) {
          cmd = [
            'cd ' + RED.settings.userDir,
            'git push -u origin master'
          ].join(';')
          gitPush = execSync(cmd).toString()
        }
      } catch(err) {
        // console.log(err)
      } finally {
        if (node.debugging) {
          RED.comms.publish("debug",{msg: {
            status: gitStatus,
            commit: gitCommit,
            push: gitPush
          }})
          //node.send({payload: msg})
        }

        res.sendStatus(200);
      }
    } else {
      res.sendStatus(404);
    }
  })
}
