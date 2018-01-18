module.exports = function(RED) {
  function GitNodesCredNode(n) {
    RED.nodes.createNode(this,n);
    this.username = this.credentials.username;
    this.password = this.credentials.password;
    this.git = n.git;
    this.name = n.name;
  }
  RED.nodes.registerType("git-nodes-config", GitNodesCredNode, {
      credentials: {
          username: {type:"text"},
          password: {type:"text"}
      }
  })
}