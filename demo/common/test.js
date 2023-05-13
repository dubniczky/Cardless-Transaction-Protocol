import assert from 'assert'
import utils from './utils.js'
import falcon from './falcon.js'


describe('Basic utilities', function () {
    it('copyObject', function () {
        const obj = {
            a: 1,
            b: {
                c: 'd',
                e: null
            }
        }

        const copied = utils.copyObject(obj)
        assert.deepStrictEqual(obj, copied)

        obj.a = 2
        assert.notDeepEqual(obj, copied)
        assert.strictEqual(obj.a, 2)
        assert.strictEqual(copied.a, 1)

        copied.b.f = true
        assert.notDeepEqual(obj, copied)
        assert.strictEqual(obj.b.f, undefined)
        assert.strictEqual(copied.b.f, true)
    })

    it('getNextRecurrance', function () {
        const now = Date.now()
        const aDay = 1000 * 60 * 60 * 24
        const dayLightSaving = 1000 * 60 * 60
        const offsetPeriod = aDay * 400
        const periodLimits = {
            monthly: [28 * aDay - dayLightSaving, 31 * aDay + dayLightSaving],
            quarterly: [89 * aDay - dayLightSaving, 92 * aDay + dayLightSaving],
            annual: [365 * aDay - dayLightSaving, 366 * aDay + dayLightSaving]
        }
        for (let i = 0; i < 10; ++i) {
            const randomOffset = Math.floor(Math.random() * offsetPeriod * 2) - offsetPeriod
            const dateStamp = now + randomOffset

            for (const period of Object.keys(periodLimits)) {
                const nextDateStamp = new Date(utils.getNextRecurrance(dateStamp, period)).getTime()
                assert.equal(dateStamp + periodLimits[period][0] <= nextDateStamp &&
                             dateStamp + periodLimits[period][1] >= nextDateStamp, true,
                             `Check whether ${nextDateStamp} is next ${period} recurrance of ${dateStamp}`)
            }
        }
    })

    it('cutIdFromUrl', function () {
        const baseUrls = [
            'https://example.com/',
            'stp://test.stp.com/sub/path/',
            'http://localhost:3000/sub_path/'
        ]

        const ids = [
            'test_id',
            'sdfsdfsewsdfsdf464w654e1f5sd165s1f56s1df',
            '013CCF92-1313-434B-A838-6BE3D9645DD1'
        ]

        for (const baseUrl of baseUrls) {
            for (const id of ids) {
                const url = baseUrl + id
                assert.strictEqual(utils.cutIdFromUrl(url), id)
            }
        }
    })
})

describe('Challenge related utilities', function () {
    const hashTypes = [ 'sha512', 'sha3512' ]

    for (const hashType of hashTypes) {
        it(`signChall and verifyChallResponse with ${hashType}`, async function () {
            const keys = await falcon.keyGen()
            const challenge = utils.genChallenge(30)
            const response = await utils.signChall(challenge, hashType, keys)
            assert.ok(await utils.verifyChallResponse(challenge, response, hashType, keys))
        })
    }
})

describe('Token verification', function () {
    const hashSuits = [ 'sha512,sha3512', 'sha3512,sha512' ]

    for (const hashSuit of hashSuits) {
        const dummyBaseToken = {
            metadata: {
                alg: hashSuit
            },
            transaction: {
                amount: 1,
                currency: 'USD'
            }
        }

        it(`verifyVendorSignatureOfToken with ${hashSuit}`, async function () {
            const baseToken = utils.copyObject(dummyBaseToken)
            const vendorKeys = await falcon.keyGen()
            const providerKeys = await falcon.keyGen()
            const hashTypes = baseToken.metadata.alg.split(',')
            const vendorHashType = hashTypes[0]
            const providerHashType = hashTypes[1]
            
            const vendorSign = await falcon.sign(Buffer.from(JSON.stringify(baseToken)), vendorHashType, vendorKeys)
            baseToken.signatures = {
                vendor: vendorSign,
                vendor_key: await falcon.exportKeyToToken(vendorKeys),
                signed_at: 'sometime'
            }

            const providerSign = await falcon.sign(Buffer.from(JSON.stringify(baseToken)), providerHashType, providerKeys)
            baseToken.signatures.provider = providerSign
            baseToken.signatures.provider_key = await falcon.exportKeyToToken(providerKeys)

            assert.ok(await utils.verifyVendorSignatureOfToken(baseToken))

            let token = utils.copyObject(baseToken)
            token.transaction.amount = 2
            assert.ok(!(await utils.verifyVendorSignatureOfToken(token)))

            token = utils.copyObject(baseToken)
            token.transaction.currency = 'BTC'
            assert.ok(!(await utils.verifyVendorSignatureOfToken(token)))

            token = utils.copyObject(baseToken)
            token.signatures.vendor = 'V2h5IHdvdWxkIGFueW9uZSBkZWNvZGUgdGhpcz8='
            assert.ok(!(await utils.verifyVendorSignatureOfToken(token)))
        })

        it(`verifyProviderSignatureOfToken with ${hashSuit}`, async function () {
            const baseToken = utils.copyObject(dummyBaseToken)
            const vendorKeys = await falcon.keyGen()
            const providerKeys = await falcon.keyGen()
            const hashTypes = baseToken.metadata.alg.split(',')
            const vendorHashType = hashTypes[0]
            const providerHashType = hashTypes[1]
            
            const vendorSign = await falcon.sign(Buffer.from(JSON.stringify(baseToken)), vendorHashType, vendorKeys)
            baseToken.signatures = {
                vendor: vendorSign,
                vendor_key: await falcon.exportKeyToToken(vendorKeys),
                signed_at: 'sometime'
            }

            const providerSign = await falcon.sign(Buffer.from(JSON.stringify(baseToken)), providerHashType, providerKeys)
            baseToken.signatures.provider = providerSign
            baseToken.signatures.provider_key = await falcon.exportKeyToToken(providerKeys)

            assert.ok(await utils.verifyProviderSignatureOfToken(baseToken))

            let token = utils.copyObject(baseToken)
            token.transaction.amount = 2
            assert.ok(!(await utils.verifyProviderSignatureOfToken(token)))

            token = utils.copyObject(baseToken)
            token.transaction.currency = 'BTC'
            assert.ok(!(await utils.verifyProviderSignatureOfToken(token)))

            token = utils.copyObject(baseToken)
            token.signatures.vendor = 'V2h5IHdvdWxkIGFueW9uZSBkZWNvZGUgdGhpcz8='
            assert.ok(!(await utils.verifyProviderSignatureOfToken(token)))

            token = utils.copyObject(baseToken)
            token.signatures.provider = 'Q29tZSBvb29uLi4u'
            assert.ok(!(await utils.verifyProviderSignatureOfToken(token)))
        })
    }
})

describe('Token encryption', function () {
    const dummyToken = {
        m: { a: 'h' },
        t: { a: 0, c: '_' }
    }

    it('encryptToken and decryptToken', function () {
        dummyToken.signatures = {
            provider: 'dummy'
        }
        const hash = utils.hashProviderSignature(dummyToken)
        const cipher = utils.encryptToken(hash, dummyToken)
        assert.deepStrictEqual(utils.decryptToken(hash, cipher), dummyToken)
    })
})