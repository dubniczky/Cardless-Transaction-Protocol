const superFalcon = require('.')
const assert = require('assert')

const hashTypes = [
    'sha512', 'sha-512', 'sha2-512', 'sha3512', 'sha3-512'
]

const message = new Uint8Array([98, 97, 108, 108, 115, 0]);

const toHex = bytes => Buffer.from(bytes).toString('hex');

describe('Key generation', function () {
    it('key pair generation', async function () {
        superFalcon.keyPair()
    })
})


describe('End-to-end test', function () {
    for (const hashType of hashTypes) {
        it(`hashType: ${hashType}`, async function () {
            const keyPair = await superFalcon.keyPair();

            const signed = await superFalcon.sign(
                hashType,
                message,
                keyPair.privateKey
            )
            const verified = await superFalcon.open(
                hashType,
                signed,
                keyPair.publicKey
            )

            const signature = await superFalcon.signDetached(
                hashType,
                message,
                keyPair.privateKey
            )
            const isValid = await superFalcon.verifyDetached(
                hashType,
                signature,
                message,
                keyPair.publicKey
            )

            assert.equal(toHex(message), toHex(verified))
            assert.ok(isValid)
        })
    }
})
