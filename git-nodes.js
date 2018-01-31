module.exports = function (RED) {
  'use strict'

  var fs = require('fs-extra')
  var execSync = require('child_process').execSync
  var node;

  function gitNodesNode(n) {

    RED.nodes.createNode(this, n)

    this.git = RED.nodes.getNode(n.git);
    this.name = n.name
    this.branch = n.branch
    this.sourcebranch = n.sourcebranch
    this.gitrmcache = n.gitrmcache
    this.gitadd = n.gitadd
    this.debugging = n.debugging
    node = this
  }
  RED.nodes.registerType('git-nodes', gitNodesNode)

  RED.httpAdmin.post("/git-nodes/:id", RED.auth.needsPermission("git-nodes.write"), function(req,res) {
    var addminNode = RED.nodes.getNode(req.params.id);
    if (addminNode != null) {

      console.log(node.id)

      node.status({fill:"green",shape:"dot",text:"Processing..."});

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
      var execOpt = {cwd: RED.settings.userDir, encoding: 'utf8'}

      try {
        // git init
        cmd = [
          'cd ' + RED.settings.userDir,
          '[ -e "./.git" ] && : || git init'
        ].join(';')
        execSync(cmd)

        // git remote add origin
        if (node.git.git) {
          cmd = [
            'cd ' + RED.settings.userDir,
            'LEN=`git remote`',
            '[ ${#LEN} -eq 0 ] && git remote add origin ' + node.git.git + ' || :'
          ].join(';')
          execSync(cmd)
          execSync('git remote set-url origin ' + node.git.git, execOpt)
        }

        // git config --local user.name
        if (node.git.username) {
          cmd = [
            'cd ' + RED.settings.userDir,
            'git config --local user.name "' + node.git.username + '"'
          ].join(';')
          execSync(cmd)
        }

        // git config --local user.email
        if (node.git.useremail) {
          cmd = [
            'cd ' + RED.settings.userDir,
            'git config --local user.email "' + node.git.useremail + '"'
          ].join(';')
          execSync(cmd)
        }

        // branch
        console.log("branch")
        var branch = ''
        if (node.branch && node.branch !== 'master') {

          // Existence check of the branch.
          var localBranchList = execSync('git branch', execOpt)
          var reg = new RegExp(' ' + node.branch + '\n')
          var isLocalBranch = reg.test(localBranchList)
          console.log(isLocalBranch, localBranchList.length)

          if (localBranchList) {
            // get current branch name
            var currentBranch = execSync('git rev-parse --abbrev-ref HEAD', execOpt)

            // Existence check of source branch.
            var reg3 = new RegExp(' ' + node.sourcebranch + '\n')
            var isSourceBranch = reg3.test(localBranchList)
            console.log(isLocalBranch)
            var sourceBranch = node.sourcebranch
            if (node.sourcebranch || !isSourceBranch) {
              sourceBranch = currentBranch
            }
            
            // When the branch exists, change it.
            if (isLocalBranch) {
              console.log("isLocalBranch true")
              execSync('git checkout ' + node.branch, execOpt)
            }
            // When there is no branch, create the branch.
            else {
              console.log("isLocalBranch false")
              execSync('git checkout -b ' + node.branch + ' ' + sourceBranch, execOpt)
            }

            // Existence check of the remote branch.
            var remoteBranchList = execSync('git branch -r', execOpt)
            var reg2 = new RegExp('/' + node.branch + '\n')
            var isRemoteBranch = reg2.test(remoteBranchList)
            console.log(isRemoteBranch)

            // When there is no branch, create the remote branch.
            if (!isRemoteBranch) {
              console.log("isRemoteBranch false")
              execSync('git push -u origin ' + node.branch, execOpt)
            }
          } 
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

        // git commit
        cmd = [
          'cd ' + RED.settings.userDir,
          'git commit -m "' + req.body.commitMessage + '"',
        ].join(';')
        gitCommit = execSync(cmd).toString()

        // git push
        if (node.git.git) {
          cmd = [
            'cd ' + RED.settings.userDir,
            'git push -u origin ' + node.branch
          ].join(';')
          gitPush = execSync(cmd).toString()
        }
      } catch(err) {
        console.log(err)
        RED.comms.publish("debug",{msg: err})
        node.status({fill:"red",shape:"dot",text:"Error"});
      } finally {
        if (node.debugging) {
          RED.comms.publish("debug",{msg: {
            status: gitStatus,
            commit: gitCommit,
            push: gitPush
          }})
          //node.send({payload: msg})
          node.status({});
        }

        res.sendStatus(200);
      }
    } else {
      res.sendStatus(500);
    }
  })
}
