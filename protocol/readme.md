# Cardless Transaction Protocol

1. The vendor generates a random key URL connecting to its endpoint


pre-signed URL

- max one request every 5 seconds per user to prevent ddos amplification

```url
https://vendorname.com/api/ctp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

from bank: request
- bankname
- id
- protocol version
- ...

from vendor: response

- Transaction id
- response url
- vendor name
- vendor logo url
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
- verification pin (4 num?)

from vendor: reponse

- success or fail
- reason for fail (request expired for example)



TOKEN:

- "card" processor
- bank id
- token ID

ASDF/ASDF/asddskflnjadslkfadsnlf4ds