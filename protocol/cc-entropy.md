# Credit Card Entropy

1234 1234 1234 1234 = 16 digits

- First six are BIN (bank identification number)
- Last four can be public according to law

->

6 or 10 are unknown

- year is usually given for 4 -> 5x
- month can be chosen from 12 -> 12x
- CCV is practically random (not enough info) 3 digit -> 10^3


$10^6*4*12*10^3 = 4.8*10^{13} \implies \lceil log_2(4.8*10^{13}) \rceil = 36 bits$

$10^10*4*12*10^3 = 4.8*14^{13} \implies \lceil log_2(4.8*14^{13}) \rceil = 49 bits$
