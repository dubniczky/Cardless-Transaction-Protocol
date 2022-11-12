# Cardless Transaction Protocol

1. The vendor generates a random key URL connecting to its endpoint


pre-signed URL

- max one request every 5 seconds per user to prevent DDoS amplification

```url
https://vendorname.com/api/ctp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

from the bank: request
- bank name
- id
- protocol version
- ...

from vendor: response

- Transaction id
- response URL
- vendor name
- vendor logo URL
- amount
- currency code
- period?

> verification code displays on the screen (4 num?)

---

```
https://vendorname.com/api/ctp/response/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

from bank

- transaction ID
- allow or disallow
- token
- expiry (1 hour?)
- verification pin (4 numbers?)

from vendor: response

- success or fail
- reason for failure (request expired for example)



TOKEN:

- "card" provider -> payment processing network: ppn
- bank id
- token ID
- expiry
- reusable

ASDF/ASDF/asddskflnjadslkfadsnlf4ds