const crypto = require("crypto")
const EC = require("elliptic").ec


const SHA256 = message => crypto.createHash("sha256").update(message).digest("hex")

const ec = new EC("secp256k1")

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e"
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex")
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex")

class Transaction {
  constructor(from, to, amount, gas = 1, args = [], timestamp = Date.now().toString()) {
    this.from = from
    this.to = to
    this.amount = amount
    this.gas = gas
    this.args = args
    this.timestamp = timestamp
  }

  sign(keyPair) {
    if (keyPair.getPublic("hex") === this.from) {
      this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount + this.gas + JSON.stringify(this.args) + this.timestamp), "base64").toDER("hex")
    }
  }

  static isValid(tx, state) {
    return (
      tx.from &&
      tx.to &&
      tx.amount >= 0 &&
      (((state[tx.from] ? state[tx.from].balance : 0) >= tx.amount + tx.gas && tx.gas >= 1) || tx.from === MINT_PUBLIC_ADDRESS) &&
      ec.keyFromPublic(tx.from, "hex").verify(SHA256(tx.from + tx.to + tx.amount + tx.gas + JSON.stringify(tx.args) + tx.timestamp), tx.signature) &&
      (state[tx.from] ? !state[tx.from].timestamps.includes(tx.timestamp) : true)
    )
  }
  
}

class Block {
  constructor(index = 1, timestamp, data, difficulty = 1) {
    this.blockNumber = index
    this.timestamp = timestamp
    this.data = data
    this.prevHash = ""
    this.hash = Block.getHash(this)
    this.difficulty = difficulty
    this.nonce = 0
  }

  static getHash(block) {
    return SHA256(block.blockNumber.toString() + block.prevHash + block.timestamp + JSON.stringify(block.data) + block.difficulty + block.nonce)
  }

  hasValidTransactions(state) {
    let gas = 0, reward = 0, balances = {}

    this.data.forEach(transaction => {
      if (transaction.from !== MINT_PUBLIC_ADDRESS) {
        if (!balances[transaction.from]) {
          balances[transaction.from] = (state[transaction.from] ? state[transaction.from].balance : 0) - transaction.amount - transaction.gas
        } else {
          balances[transaction.from] -= transaction.amount + transaction.gas
        }
        gas += transaction.gas
      } else {
        reward = transaction.amount
      }
    })

    return (
      this.data.every(transaction => Transaction.isValid(transaction, state)) &&
      this.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1 &&
      Object.values(balances).every(balance => balance >= 0)
    )
  }
}

class Blockchain {
  constructor() {
    this.chain = [new Block(1, "1647245268695", [], 1)]
    this.transactions = []
    this.difficulty = 1
    this.state = {
      [MINT_PUBLIC_ADDRESS]: {
        balance: 100000000000000,
        body: "",
        timestamps: [],
        storage: {}
      }
    }
  }

  getLastBlock() {
    return this.chain[this.chain.length - 1];
  }

  createWallet() {
    const keyPair = ec.genKeyPair()
    const address = keyPair.getPublic("hex")
    this.state[address] = {
      balance: 0,
      body: "",
      timestamps: [],
      storage: {}
    }
    return keyPair
  }

  addTransaction(transaction) {
    let balance = this.getBalance(transaction.from) - transaction.amount - transaction.gas

    this.transactions.forEach(tx => {
      if (tx.from === transaction.from) {
        balance -= tx.amount + tx.gas
      }
    })

    if (
      Transaction.isValid(transaction, this.state) &&
      balance >= 0 &&
      !this.transactions.filter(_tx => _tx.from === transaction.from).some(_tx => _tx.timestamp === transaction.timestamp)
    ) {
      this.transactions.push(transaction)
    }
  }

  getBalance(address) {
    return this.state[address] ? this.state[address].balance : 0
  }

  mine() {
    this.transactions.forEach((transation) => {
      const block = new Block(this.chain.length, Date.now().toString(), [transation], 1)
      block.prevHash = JeChain.getLastBlock().hash
      block.hash = Block.getHash(block)
      if (block.prevHash !== JeChain.getLastBlock().prevHash) {
        if(block.hasValidTransactions(this.state)) {
          this.chain.push(block)
        }
      }

    })

    this.chain.forEach(block => {
      changeState(block, this.state)
    })
  }
}

function changeState(newBlock, state) {
  newBlock.data.forEach(tx => {
    state[tx.to].balance += tx.amount
    state[tx.from].balance -= tx.amount + tx.gas

    state[tx.from].timestamps.push(tx.timestamp)
  })
}



const chain = new Blockchain()

console.log(chain.getBalance(MINT_PUBLIC_ADDRESS))
const wallet = chain.createWallet()
console.log(chain.getBalance(wallet.getPublic("hex")))
const tr = new Transaction(MINT_PUBLIC_ADDRESS, wallet.getPublic("hex"), 10)
tr.sign(MINT_KEY_PAIR)
chain.addTransaction(tr)
chain.mine()
console.log(chain.getBalance(wallet.getPublic("hex")))
console.log(chain.getBalance(MINT_PUBLIC_ADDRESS))