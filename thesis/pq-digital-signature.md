# Post-Quantum Digital Signatures

The [NIST Post-Quantum Cryptography Standardization](https://en.wikipedia.org/wiki/NIST_Post-Quantum_Cryptography_Standardization) is still in progress. So far there was only one winner announcement: [NIST PQC Selected Algorithms 2022](https://csrc.nist.gov/Projects/post-quantum-cryptography/selected-algorithms-2022). It has 3 signature schemes:

- [CRYSTALS-Dilithium](https://pq-crystals.org/dilithium/index.shtml)
- [FALCON](https://falcon-sign.info)
- [SPHINCS+](https://sphincs.org)

## General data

|Name|Implementation|License|Underlying problem|
|---|---|---|---|
|[CRYSTALS-Dilithium](https://pq-crystals.org/dilithium/index.shtml)|- [Original repo - C](https://github.com/pq-crystals/dilithium)<br>- [Emscriptem WA/JS Wrapper](https://www.npmjs.com/package/dilithium-crystals?activeTab=readme)<br>- **Recommended:** [superdilithium - JS](https://www.npmjs.com/package/superdilithium?activeTab=readme)|[Apache 2.0](https://github.com/pq-crystals/dilithium/blob/master/LICENSE)|Module Lattices (similar to [Ring-LWE](https://en.wikipedia.org/wiki/Ring_learning_with_errors))|
|[FALCON](https://falcon-sign.info/)|- [Original - C](https://falcon-sign.info/impl/falcon.h.html)<br>- [Official Python impl](https://github.com/tprest/falcon.py)<br>- [Emscriptem WA/JS Wrapper](https://www.npmjs.com/package/falcon-crypto?activeTab=readme)<br>- **Recommended:**  [superfalcon - JS](https://www.npmjs.com/package/superfalcon?activeTab=readme)|[MIT](https://github.com/tprest/falcon.py/blob/master/LICENSE)|[SIS](https://en.wikipedia.org/wiki/Short_integer_solution_problem) over [NTRU](https://en.wikipedia.org/wiki/NTRU) lattices|
|[SPHINCS+](https://sphincs.org/)|- [Original repo - C](https://github.com/sphincs/sphincsplus)<br>- [Go](https://github.com/kasperdi/SPHINCSPLUS-golang)<br>- [Java](https://extgit.iaik.tugraz.at/krypto/javasphincsplus)<br>- [Emscriptem WA/JS Wrapper](https://www.npmjs.com/package/sphincs?activeTab=readme)<br>- **Recommended:** [supersphincs - JS](https://www.npmjs.com/package/supersphincs?activeTab=readme)|[CC0](https://github.com/sphincs/sphincsplus/blob/master/LICENSE)|[Hash-based signature](https://en.wikipedia.org/wiki/Hash-based_cryptography)|

**Note:** It is advised to use any PQ signature scheme in a hybrid mode (combined with a stable pre-quantum scheme). The recommended implementations for all three use an Emscriptem WA/JS wrapper of the original source combined with Ed25519 (ECC) from libsodium.js.

## Comparison

|Method|Security level|Public key size (bytes)|Private key size (bytes)|Signature size (bytes)|Keygen (CPU cycles)|Sign (CPU cycles)|Verify (CPU cycles)|
|---|---|---|---|---|---|---|---|
|Crystals Dilithium 2|1 (AES-128)|1 312|2 528|2 420|116 511|342 726|112 506|
|Crystals Dilithium 3|3 (AES-192)|1 952|4 000|3 293|191 331|534 254|180 350|
|Crystals Dilithium 5|5 (AES-256)|2 592|4 864|4 595|307 765|610 807|417 971|
|Falcon 512|1 (AES-128)|897|1 281|690|24 656 358|1 085 984|183 949|
|Falcon 1024|5 (AES-256)|1 793|2 305|1 330|74 741 342|2 204 927|359 553|
|Sphincs SHA256-128f Simple|1 (AES-128)|32|64|17 088|3 088 404|72 191 077|8 962 488|
|Sphincs SHA256-192f Simple|3 (AES-192)|48|96|35 664|3 920 103|119 085 653|12 269 960|
|Sphincs SHA256-256f Simple|5 (AES-256)|64|128|49 856|10 771 651|220 637 782|12 168 947|

Sources:
- [Digital Signatures for the Future: Dilithium, FALCON and SPHINCS+ (medium)](https://medium.com/asecuritysite-when-bob-met-alice/digital-signatures-for-the-future-dilithium-falcon-and-sphincs-4d1fce92be62)
- [PQC Digital Signature Speed Tests (a security site)](https://asecuritysite.com/pqc/pqc_sig)

### Token sizes with different signatures

Limited to NIST level 5 security methods.

Token size = content (1 KB) + 2 pub keys + 2 signatures
|Method|Token size(KB)|
|---|---|
|Crystals Dilithium 5|15|
|Falcon 1024|7|
|Sphincs SHA256-256f Simple|101|

## Conclusion

- Dilithium
  - The fastest in all areas
  - Relatively large key sizes
  - Moderate signature size
- Falcon
  - Key generation is really slow
  - Sign and verify are relatively fast (but not as fast as Dilithium)
  - Beats Dilithium in key and signature sizes
- Sphincs+
  - Really small key sizes
  - Way too large signature size
  - Slow performance