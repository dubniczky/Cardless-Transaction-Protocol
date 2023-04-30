import superfalcon from 'superfalcon'
import fs from 'fs'

async function keyGen() {
    return await superfalcon.keyPair()
}


async function writeKeys(keyPair, privkeyFile, pubkeyFile) {
    const keyData = await superfalcon.exportKeys(keyPair)

    delete keyData.public.combined
    delete keyData.private.combined

    keyData.public.type = 'public'
    keyData.private.type = 'private'

    fs.writeFileSync(pubkeyFile, Buffer.from(JSON.stringify(keyData.public)))
    fs.writeFileSync(privkeyFile, Buffer.from(JSON.stringify(keyData.private)))
}


async function readKey(file) {
    const keyData = JSON.parse(fs.readFileSync(file))
    if (keyData.type === 'public') {
        return await superfalcon.importKeys({
            public: {
                classical: keyData.classical,
                postQuantum: keyData.postQuantum
            }
        })
    } else if (keyData.type === 'private') {
        return await superfalcon.importKeys({
            private: {
                classical: keyData.classical,
                postQuantum: keyData.postQuantum
            }
        })
    } else {
        throw Error('Unknown key type')
    }
}


async function sign(message, privKey) {
    const signature = await superfalcon.signDetached(message, privKey.privateKey)
    return Buffer.from(signature).toString('base64')
}


async function verify(signature, message, pubKey) {
    return await superfalcon.verifyDetached(
        Buffer.from(signature, 'base64'),
        message,
        pubKey.publicKey
    )
}


async function exportKeyToToken(pubKey) {
    const keyData = await superfalcon.exportKeys(pubKey)
    return keyData.public.combined
}


async function importKeyFromToken(tokenKey) {
    return await superfalcon.importKeys({
        public: {
            combined: tokenKey
        }
    })
}

export default {
    keyGen, writeKeys, readKey, sign, verify, exportKeyToToken, importKeyFromToken
}