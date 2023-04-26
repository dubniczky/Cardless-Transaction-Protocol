import superfalcon from 'superfalcon'
import { sha512, sha3 } from 'hash-wasm'
import sodiumutil from 'sodiumutil'


function formatHash(hash, onlyBinary) {
    const bin = sodiumutil.from_hex(hash)
    if (onlyBinary) {
        return bin
    } else {
        return {
            binary: bin,
            hex: hash
        }
    }
}


async function sha2_512(msg, onlyBinary) {
    return formatHash(await sha512(msg), onlyBinary)
}


async function sha3_512(msg, onlyBinary) {
    return formatHash(await sha3(msg, 512), onlyBinary)
}


console.log((await superfalcon.hash('apple')).hex)
superfalcon.hash = sha3_512
console.log((await superfalcon.hash('apple')).hex)
superfalcon.hash = sha2_512
console.log((await superfalcon.hash('apple')).hex)
superfalcon.hash = sha3_512
console.log((await superfalcon.hash('apple')).hex)