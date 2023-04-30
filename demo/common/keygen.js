import falcon from './falcon.js'

const keyPair = await falcon.keyGen()

await falcon.writeKeys(keyPair, 'privkey.json', 'pubkey.json')
