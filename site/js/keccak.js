/* =============================================================================
   KECCAK-256 — o do Ethereum, no navegador.

   ESTE ARQUIVO E UM PORTE, E NAO CODIGO NOVO. O nucleo — `girar`, `RC`,
   `DESLOC`, `permutar` e a absorcao — saiu VERBATIM de scripts/keccak.mjs, que
   por sua vez saiu de scripts/gerar-abi-console.mjs. Aquele modulo e quem gera
   os seletores do artefato compilado, e cada seletor que ele produz e conferido
   contra o que o `forge` escreveu: sao 133 assinaturas em que esta mesma
   aritmetica ja concorda com o `solc`.

   Reescrever seria criar a segunda canonicalizacao do mesmo objeto, que e a
   razao de site/js/motor.js existir. O Tubarao-branco autorizou o PORTE e
   nomeou o delta permitido: as DUAS ocorrencias de `Buffer`, que nao existem
   no navegador.

     scripts/keccak.mjs            navegador
     Buffer.from(texto, "utf8")    new TextEncoder().encode(texto)
     Buffer.alloc(n)               new Uint8Array(n)   (ja nasce zerado)
     msg.copy(destino)             destino.set(msg)

   O QUE FOI ACRESCENTADO, e por que nao e divergencia: o original recebe TEXTO,
   e esta onda precisa hashear BYTES — `abi.encode` produz hexadecimal, e
   `keccak256(routeCalldata)` e sobre bytes de calldata, nao sobre caracteres.
   Entao a entrada primaria virou `keccak256Bytes`, e as outras duas chamam ela.
   UM nucleo, tres portas. Converter hex em texto e depois hashear daria outro
   hash, silenciosamente.

   O padding e 0x01 (Ethereum), NAO o 0x06 do SHA3-256 do NIST.
   ============================================================================= */
(function (raiz) {
  "use strict";

  var MASCARA = (1n << 64n) - 1n;
  var girar = function (x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASCARA; };

  var RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  /* r[x][y] — deslocamentos de rho, tabela padrao do Keccak. */
  var DESLOC = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
  ];

  function permutar(A) {
    for (var rodada = 0; rodada < 24; rodada++) {
      /* theta */
      var C = new Array(5), D = new Array(5), x, y;
      for (x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ girar(C[(x + 1) % 5], 1);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];
      /* rho + pi */
      var B = new Array(25).fill(0n);
      for (x = 0; x < 5; x++)
        for (y = 0; y < 5; y++)
          B[y + 5 * ((2 * x + 3 * y) % 5)] = girar(A[x + 5 * y], DESLOC[x][y]);
      /* chi */
      for (x = 0; x < 5; x++)
        for (y = 0; y < 5; y++)
          A[x + 5 * y] = B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & MASCARA & B[((x + 2) % 5) + 5 * y]);
      /* iota */
      A[0] ^= RC[rodada];
    }
    return A;
  }

  /** keccak-256 sobre BYTES. As outras duas portas passam por aqui. */
  function keccak256Bytes(bytes) {
    var TAXA = 136;                      /* 1088 bits */
    var msg = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var preenchido = new Uint8Array(Math.ceil((msg.length + 1) / TAXA) * TAXA);
    preenchido.set(msg);
    preenchido[msg.length] = 0x01;
    preenchido[preenchido.length - 1] |= 0x80;

    var A = new Array(25).fill(0n);
    for (var off = 0; off < preenchido.length; off += TAXA) {
      for (var i = 0; i < TAXA / 8; i++) {
        var lane = 0n;
        for (var b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(preenchido[off + i * 8 + b]);
        A[i] ^= lane;
      }
      A = permutar(A);
    }
    var saida = "";
    for (var k = 0; k < 4; k++) {
      var l = A[k];
      for (var c = 0; c < 8; c++) { saida += (l & 0xffn).toString(16).padStart(2, "0"); l >>= 8n; }
    }
    return "0x" + saida;
  }

  /** keccak-256 sobre TEXTO — a porta que o original expunha. */
  function keccak256(texto) {
    return keccak256Bytes(new TextEncoder().encode(String(texto)));
  }

  /** keccak-256 sobre HEXADECIMAL. `abi.encode` produz hex, e hashear os
      CARACTERES do hex daria outro valor sem avisar ninguem. */
  function keccak256Hex(hex) {
    var h = String(hex == null ? "" : hex).replace(/^0x/, "");
    if (h.length % 2 !== 0) throw new Error("hexadecimal com numero impar de digitos: nao ha como virar bytes");
    if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error("isto nao e hexadecimal: " + String(hex).slice(0, 24));
    var b = new Uint8Array(h.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return keccak256Bytes(b);
  }

  /* Vetor conhecido do proprio Keccak. Quem carrega este arquivo herda a prova:
     se a pagina carregou sem lancar, o keccak reproduz a entrada vazia.
     Autoconferencia NO CARREGAMENTO, e nao um teste que alguem lembra de rodar
     — condicao 2 do julgamento do Tubarao-branco, e ela viajou junto do porte
     de proposito. */
  var VETOR_VAZIO = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
  if (keccak256("") !== VETOR_VAZIO) {
    throw new Error("keccak256 nao bate o vetor conhecido da entrada vazia — " +
      "nada que dependa disto deve rodar");
  }
  /* SEGUNDO vetor, e ele existe porque o primeiro nao prova o que importa aqui:
     a entrada vazia cabe num bloco so, e uma implementacao que erre a absorcao
     do SEGUNDO bloco passa nela sem esforco. Foi essa a medicao que reprovou o
     gabarito inicial desta onda — das 133 assinaturas do artefato, apenas UMA
     passa dos 136 bytes de um bloco, e os hashes que este arquivo existe para
     calcular tem 288 bytes, ou tres blocos.
     136 bytes e o pior caso da fronteira: a mensagem enche o primeiro bloco
     exatamente, e o padding sozinho forca um segundo. Valor MEDIDO com
     scripts/keccak.mjs, o mesmo modulo cujos seletores o `forge` confere. */
  var CENTO_TRINTA_E_SEIS = new Array(137).join("a");
  var VETOR_136 = "0xa6c4d403279fe3e0af03729caada8374b5ca54d8065329a3ebcaeb4b60aa386e";
  if (keccak256(CENTO_TRINTA_E_SEIS) !== VETOR_136) {
    throw new Error("keccak256 nao bate o vetor de 136 bytes — a absorcao de multiplos " +
      "blocos esta errada, e todo hash desta pagina tem mais de um bloco");
  }
  /* TERCEIRO: a porta de hexadecimal, que e por onde os hashes desta onda
     entram. Hashear os CARACTERES do hex em vez dos bytes daria outro valor sem
     avisar, e este vetor e o que separa as duas coisas: 32 bytes zerados nao
     sao a string "0000...". */
  var VETOR_HEX_32 = keccak256Bytes(new Uint8Array(32));
  if (keccak256Hex("0x" + new Array(65).join("0")) !== VETOR_HEX_32) {
    throw new Error("keccak256Hex nao concorda com keccak256Bytes sobre 32 bytes zerados — " +
      "a conversao de hexadecimal para bytes esta errada");
  }

  var API = { keccak256: keccak256, keccak256Hex: keccak256Hex, keccak256Bytes: keccak256Bytes };
  if (typeof module !== "undefined" && module.exports) { module.exports = API; }
  if (raiz) { raiz.TRIVIU_KECCAK = API; }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
