The files in this folder implement Uniform Resources (BCR-2020-005), Bytewords
(BCR-2020-012) and their fountain codes. Their algorithms follow the Blockchain
Commons reference implementation `bc-ur` (C++), whose published test vectors
the tests in `src/lib/__tests__/ur-*.test.ts` embed. That code is under this
licence, and its notice is kept here as it asks:

    BSD-2-Clause Plus Patent License
    SPDX-License-Identifier: BSD-2-Clause-Patent
    Copyright © 2020 by Blockchain Commons, LLC

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice,
       this list of conditions and the following disclaimer.
    2. Redistributions in binary form must reproduce the above copyright notice,
       this list of conditions and the following disclaimer in the documentation
       and/or other materials provided with the distribution.

    Subject to the terms and conditions of this license, each copyright holder
    and contributor hereby grants to those receiving rights under this license a
    perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
    (except for failure to satisfy the conditions of this license) patent license
    to make, have made, use, offer to sell, sell, import, and otherwise transfer
    this software, where such license applies only to those patent claims,
    already acquired or hereafter acquired, licensable by such copyright holder
    or contributor that are necessarily infringed by: (a) their Contribution(s)
    (the licensed copyrights of copyright holders and non-copyrightable additions
    of contributors, in source or binary form) alone; or (b) combination of their
    Contribution(s) with the work of authorship to which such Contribution(s) was
    added by such copyright holder or contributor, if, at the time the
    Contribution is added, such addition causes such combination to be
    necessarily infringed. The patent license shall not apply to any other
    combinations which include the Contribution. Except as expressly stated
    above, no rights or licenses from any copyright holder or contributor is
    granted under this license, whether expressly, by implication, estoppel or
    otherwise.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
    AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
    ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
    CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
    SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
    INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
    CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
    ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
    POSSIBILITY OF SUCH DAMAGE.

`xoshiro.ts` implements xoshiro256** 1.0 by David Blackman and Sebastiano
Vigna (2018), which its authors dedicated to the public domain (CC0 1.0,
<http://creativecommons.org/publicdomain/zero/1.0/>).

The byteword table in `bytewords.ts` is the table published in BCR-2020-012.
