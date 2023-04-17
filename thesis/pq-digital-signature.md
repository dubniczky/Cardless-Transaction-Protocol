# Post-Quantum Digital Signatures

## About digital signatures

Digital signatures are cryptography primitives for verifying the integrity and authenticity of messages, documents, smart cards, etc. A digital signature scheme contains 3 methods: *Gen*, *Sign* and *Vrfy*:

- *Gen* is used for generating the necessary keypair for signatures: $Gen(1^n) = (pk, sk)$
- *Sign* creates a signature of a given message using the private key: $Sign(m, sk) = \sigma$
- *Vrfy* verifies the correectness of the signature using the public key: $Vrfy(m, \sigma, pk) = \{0, 1\}$

One really useful feature of digital signature schemes is non-repudiation. It states, that anyone having access to the message, the signature, and the signer's public key is able to verify, that the signature happened with the signer's private key, which is known only by the signer. More specifically the signer cannot later deny that they signed the message.

## Popular digital signature schemes

Digital signatures are based on hard one-way mathematical computations. These problems are relatively easy to execute in one direction, but exponentialy difficult to reverse. The most commonly used problems are:

- The factorization problem (RSA)
- The discrete logarithm or DLOG problem (DSA, Schnorr, ElGamal)
- The eliptic curve DLOG problem (ECDSA, EdDSA)

Unfortunatly, these algorithms are susceptible to attacks by large scale qunatum computers. Using Shor's algorithm most of these schemes can be broken, meaning signatures could be forged knowing only the public key.

## Post-Quantum candidates

Quantum computers did not reach the levels necessary to break modern pre-quantum algorithms yet. Still sensitive data created now could be relevant years later, when quantum computers will be an actual threat. For this reason the National Institute of Standards and Technology (NIST) started the [Post-Quantum Cryptography Standardization](https://csrc.nist.gov/projects/post-quantum-cryptography) to establish alternatives to the beforementioned algorithms. The standardization is still in progress, but in 2022 some algorithms were selected to be the first standardized PQ algorithms. This anouncement contained 3 digital signature schemes:

- [CRYSTALS-Dilithium](https://pq-crystals.org/dilithium/index.shtml)
- [FALCON](https://falcon-sign.info)
- [SPHINCS+](https://sphincs.org)

Dilithium and Falcon are based on lattices, menawhile Sphincs is based on hash function, both of which are uneffected by quantum computers. All three above have their original versions implemented in C, but also have WebAssembly wrappers for JavaScript. Furthermore, each one is under some permissive open-source licenses like the Apache 2.0 and the MIT license.

## Comparison

The tablew below constain different versions of the 3 standardized schemes with relevant data about their key and signature sizes, security leves and performances.

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

As seen above Dilithium is the fastest algorithm in all three aspects and it has moderate key and signature sizes. At the same time Falcon performes more poorly, escpecially in key generation, but has noticably smaller key and signature sizes. Finally, Sphincs operates with really small keysizes (even smaller, then a similarly secure RSA), but both its performance and signature size is inadequite for our use.

We also need to consider, that it is recommended to use PQ algorithms in hybrid mode, combining them with a well-established pre-quantum algorithm. This is necessary because the afforementioned algorithms are not fully standardized yetm so they are most likely quantum-safe, but the certainty of this may not meet industry standards. For this reason already proved robust algorithms should be used for redundacy reasons.

Source: [NIST's Hybrid Mode Approach to Post-Quantum Computing](https://utimaco.com/news/blog-posts/nists-hybrid-mode-approach-post-quantum-computing-why-crypto-agility-crucial)

## Our choice

To make our protocol as future-proof as possible we decided to use the highest available security level versions of the digital signature schemes (NIST security level 5, AES-256).

The next important aspect for us is the key and signature sizes. PQ signature schemes performe here much more poorly, the pre-quantum ones, meanwhile our token contains 2 public keys and 2 signatures. The token's size with different algorithms would be the following approximately:

|Method|Token size(KB)|
|---|---|
|Crystals Dilithium 5|15|
|Falcon 1024|7|
|Sphincs SHA256-256f Simple|101|

*Token size = content (1 KB) + 2 pub keys + 2 signatures*

From this comparison alone we ruled out Sphincs as a candidate.

Finally, we decided to use **Falcon 1024** for our protocol, mainly because of the smaller signature size. At the sime time we acknowledge Falcon's shortcommings when compared to Dilithium. However, the key generation is not a commonly executes action, so the speed of it is not as relevant, as other factors. Also, the signing process is 3.6 times slower in Falcon, but the verification is 1.16 times faster. We are willing to accept these performance compromises in order to keep the token's size as small as possible.

## About Falcon

Falcon stands for **Fa**st Fourier **l**attice-based **co**mpact signatures over **N**TRU. As its name states, our chosen algorithm is a lattice-based digital signature scheme. This class of problems are believed to be secure under large scale quantum computers, unlike the factorization and discrete logarithm based algorithms.

The basic idea behind lattice-based problems is that an N-dimensional lattic can be generated by chosing any N linearly independent vectors (points in the lattice) as the generator. Given arbitrary generator vectors and a target point in the lattice it is usually hard to find which linear combination of the vectors give back the target point. At the same time if the length of the generator vectors are minimal, then finding the correct linear combination is much more feasable. (*The actual problems, on which the afforementioned algorithms are based on can vary from this of course. This is just a high level overview of the problem class.*)

Falcon combines the [GPV framework](https://eprint.iacr.org/2007/432) with NTRU lattices and the [Fast Fourier Sampling](https://eprint.iacr.org/2015/1014). The design rationale of Falcon revolves around optimizing for the size of the public key and the signature, the parameters of the scheme which are commonly transported over networks. This is exactly what we need to keep our token's size compact.

In its core Falcon instantiates the GPV framework. The framework describes a general lattice-based digital signature scheme without specifying the exact lattices and samplers used. In GPV the different parts of the sceme are defined as th following:

- The public key is a full-rank matrix $A \in \Z_q^{n \times m}$ ($m > n$)
- The private key is a matrix $B \in \Z_q^{m \times m}$, which generates a lattice $\Lambda_q^\perp$ perpendicular to $\Lambda$ modulo $q$. Also $B \times A^T = 0$
- For message $m$ the signature is $s$ in such a way that $sA^T = H(m)$, where $H: {0,1}^* \rightarrow \Z_q^n$ is a hash function
- Knowing $s$, $A$ and $m$ the verification is trivial

The GPV framework requires a class of lattices and a trapdoor sampler to be instantiated. In case of Falcon NTRU lattices are used, since they can reduce the public key's size by a  factor of $O(n)$, while speeding up some essential parts of the algorithm by a factor of $O(n/log n)$. NTRU lattices are described by four polynomials $f,g,F,G \in \Z[x]/(\phi)$, where $\phi = x^n + 1$ and $n = 2^k$. These polynomials satisfy the following equation:

$fG - gF = q$ mod $\phi$

Provided, that $f$ is invertubla modulo $q$, we can define $h := g \cdot f^{-1}$ mod $q$. This way the original polynomails $\begin{bmatrix} f & g \\ F & G \end{bmatrix}$ and $\begin{bmatrix} 1 & h \\ 0 & q \end{bmatrix}$ generate the same lattice. Knowing this GPV can be instantiated in such a way:
$$A = \begin{bmatrix} 1 & h \end{bmatrix}$$
$$B = \begin{bmatrix} g & -f \\ G & -F \end{bmatrix}$$
The public key $A$ is equivalent to knowing polynomial $h$, so the public key is relatively short.

Creating a short signature is more delicate. To achieve this first preimage $c_0 \in \Z_q^m$ calculated in a way, that it satisfies $c_0A^T = H(m)$. After this $v \in \Lambda_q^\perp$ can be calculated using the matrix $B$. Finally let the signature be $s = c_0 - v$, so $sA^T = c_0A^T - vA^T = c - 0 = H(m)$. Knowing $B$ we can minimize $c_0 - v$ to make the signature as ashort as possible.

To find $v \in \Lambda_q^\perp$ without leaking any information about $B$ a so called trapdoor sampler is required, which randomly samples the shifted lattice $c_0 + \Lambda_q^\perp$. The creators of Falcon chose the quite new Fast Fourier Sampler which combines the quality of [Klein](https://cs.brown.edu/research/pubs/pdfs/2000/Klein-2000-FCL.pdf) with the efficiency of [Peikert's algorithm](https://eprint.iacr.org/2010/088.pdf). At the same time the randomness the FFS brought breaks one of GPV's requirements, which states that two signatures of the same hash can never be made public simultaneously. To combat this a random seed $r \in \{0,1\}^k$ is appended before the message in hashing, and it is also appended to the signature to make the verification possible.

More detailed specification of Falcon can be found [here](https://falcon-sign.info/falcon.pdf)