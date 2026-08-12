
/* ================= i18n EN / ES ================= */
var LANG="en";
var T={
en:{
 nav_protocol:"Protocol",nav_how:"How it works",nav_math:"The math",nav_trilemma:"Trilemma",nav_education:"Education",nav_sim:"Simulate",nav_chains:"Chains",nav_learn:"Learn",nav_verify:"Verify",nav_road:"Roadmap",nav_code:"Read the code",
 hero_eyebrow:"Open protocol · EVM · Polygon first · no token",
 hero_h1:"Don't trust.<br>Verify.",
 hero_sub:"Triviu is an open, non-custodial protocol for atomic triangular arbitrage on Polygon, with the same audited contracts designed for Arbitrum and BSC — built to be read, audited and run by you. Educational infrastructure, with every rule public and every limit documented.",
 hero_cta1:"Read the code",hero_cta2:"Read the whitepaper",
 hero_m1:"<b>AGPL-3.0</b> code · <b>CC BY 4.0</b> brand · signed releases",
 hero_m2:"stateless executor · parameters via public PR · audit before mainnet",
 hero_scroll:"Scroll — the risk notice comes first",
 hero_drag:"Drag · turn the cycle · tap a node",
 risk_t:"⚠ RISK NOTICE — REQUIRED READING",
 risk_p:"Most atomic-arbitrage opportunities — on any chain — are captured by professional operators. For most individual users, the expected result after gas costs tends toward zero or negative. Triviu is educational infrastructure — it is not a source of income. Reverted transactions still pay gas.",
 p_eyebrow:"01 · The protocol",p_h2:"One transaction. Three legs. Zero custody.",
 p_lead:"A triangular cycle A→B→C→A runs inside a single atomic transaction: either it closes with the minimum profit, or everything reverts and no leg is left exposed. Your keys and your funds never touch us — the executor is stateless by construction.",
 c1_t:"Atomic executor",c1_p:"Stateless, verified contract. Pulls the principal from the caller, runs the legs, returns everything in the same transaction — or reverts it all.",
 c2_t:"Parameter registry",c2_p:"Whitelists and caps on-chain. Every change records the URL of its public pull request: forum → Git → block.",
 c3_t:"Fork simulator",c3_p:"Every route runs on a local fork of the target chain before anything else. Mistakes there are free — and that is the point.",
 c4_t:"Open engine",c4_p:"Cycle detection with Bellman–Ford over −log(rates), written to be read. dry-run by default; mainnet requires an explicit risk acknowledgment.",
 rd1_l:"Reading I · the name",rd1_t:"The trivium",rd1_p:"Latin for the meeting of three roads — and the classical curriculum that founded education.",
 rd2_l:"Reading II · the product",rd2_t:"The route",rd2_p:"Three pools in one closed, atomic loop. It ends where it began, or it never happened.",
 rd3_l:"Reading III · the context",rd3_t:"The trilemma",rd3_p:"Decentralization, security, scalability — one node each. Traveled, not chosen.",
 enter0:"Scroll to enter · How it works",enter1:"Scroll to enter · The math",enter2:"Scroll to enter · The trilemma",enter3:"Scroll to enter · Education",enter4:"Scroll to enter · Read this twice",enter5:"Scroll to enter · Roadmap",enter6:"Scroll to enter · FAQ",
 h_eyebrow:"02 · How it works",h_h2:"Detect. Simulate. Execute — or revert.",
 h_lead:"Three moves, always in this order. The third one has two honest endings, and both are published.",
 s1_t:"Detect",s1_p:"The open engine watches whitelisted pools and searches for negative cycles over −log(rates) — Bellman–Ford, in readable code.",s1_g:"off-chain · open source",
 s2_t:"Simulate",s2_p:"Every candidate route runs on a local fork of the target chain first. Gas, slippage and revert reasons — measured where mistakes cost nothing.",s2_g:"fork · mandatory",
 s3_t:"Execute — or revert",s3_p:"On-chain, the contract enforces the profit condition. Met: everything returns to your wallet. Not met: the whole transaction reverts. Both outcomes go on the public dashboard.",s3_g:"atomic · non-custodial",
 m_eyebrow:"03 · The math",m_h2:"The whole strategy fits in one condition.",
 m_lead:"For volume V in asset A, effective rates r and pool fees φ, the contract enforces exactly this — and reverts when it fails. No discretion, no dashboard magic: a formula you can check.",
 m_c1:"// gross profit of the cycle",m_c2:"// execution condition — otherwise the whole tx reverts",
 m_link:"See it implemented in the executor →",
 wex_eye:"A simulated result · not a projection",wex_h:"What a cycle actually returns.",
 wex_lead:"Four honest markets, run through the same math the contract enforces (1,000 in A). Watch how rarely one clears.",
 wex_l1:"Fair market · product 1.0000",wex_v1:"reverts · fee wall",
 wex_l2:"A 1% edge · product 1.0100",wex_v2:"reverts · still short",
 wex_l3:"A rare 3% edge · product 1.0303",wex_v3:"+6.18 · rare",
 wex_l4:"Same edge, oversized · 40,000 in",wex_v4:"reverts · slippage",
 wex_cta:"Run your own market →",wex_note:"Real numbers from the audited AMM math — 0.997 fee per hop, price impact, gas. Not a forecast.",
 t_eyebrow:"04 · The trilemma",t_h2:"We don't solve the trilemma. We travel it.",
 t_lead:"No blockchain maximizes decentralization, security and scalability at once. The industry markets that away; we document it instead. Every architecture decision ships with a Tradeoff Record — and a record without a cost line is invalid.",
 t_fnum:"TRADEOFF RECORD No. 0001 · FOUNDING DECISION",t_ftit:"Execution network: Polygon PoS",
 t_ax1:"Scalability<span class='chip'>GAINS</span>",t_r1:"Low gas makes small cycles executable and mistakes cheap — the prerequisite of hands-on education.",
 t_ax2:"Security<span class='chip'>HOLDS</span>",t_r2:"Atomicity removes leg exposure; contract risk remains — external audit before v1.",
 t_ax3:"Decentralization<span class='chip'>COSTS</span>",t_r3:"We inherit Polygon's validator set. Mitigation: verified contracts, local simulation, self-hosted RPC.",
 t_more:"Polygon is the founding record. The same EVM contracts extend to <b>Arbitrum</b> (Record 0004) and <b>BSC</b> (0005) — each pays a different price; BSC is the most centralized of the three, and we say so. <b>Solana</b> is not EVM: a deferred sibling protocol (0006), not a config. Nothing is \"live\" until its own gate clears. <a href=\"/chains\">See the expansion records →</a>",
 e_eyebrow:"05 · Education",e_h2:"Learn it before you run it.",
 e_lead:"A public curriculum, with any AI-generated content labeled as AI in every video and every piece — always. The editorial rule is non-negotiable: show technology, never income.",
 e1_t:"AMMs from zero",e1_p:"How pools set prices, and why that creates the discrepancies arbitrage closes.",
 e2_t:"Anatomy of a real cycle",e2_p:"Gas, slippage, competition — the numbers of one real transaction, block by block.",
 e3_t:"Run it yourself",e3_p:"<a href=\"/simulate\">Simulate a cycle here</a> — no wallet, no money — then read the code and run it on a fork.",
 e4_t:"Wallet & MEV literacy",e4_p:"Key safety, approvals hygiene, and how professional searchers actually win.",
 e_badge:"— the badge every piece of persona content carries, by rule.",
 e_course:"Open the full course →",
 n_eyebrow:"06 · Read this twice",n_h2:"What Triviu is not.",
 n1:"It does not custody funds — there is no deposit function anywhere.",
 n2:"It has no token, presale or allocation — and none is planned.",
 n3:"It sells no signals, premium groups or \u201cguaranteed\u201d strategies.",
 n4:"It promises no returns. Possibility is not probability.",
 n_nota:"If anyone offers any of these things in Triviu's name, it is a scam — report it. The only official surfaces are this site and the public repository.",
 v_eyebrow:"07 · Don't trust: verify",v_h2:"Everything we claim, you can check.",
 v_th1:"What",v_th2:"Where",
 v_r1:"Whitepaper — the founding document",v_r2:"Contracts, v0 — tested, external audit pending",v_r3:"Decisions and their costs (Tradeoff Records)",v_r4:"Verified addresses on each chain's explorer",v_r5:"Public dashboard — failures included",
 v_soon1:"at mainnet deploy, after the external audit",v_soon2:"live · triviu.vercel.app/dashboard",
 mt1_l:"Executions · incl. reverts",mt2_l:"Revert rate · 30d",mt3_l:"Gas spent vs. net result",
 mt_n:"after mainnet deploy",mt_n2:"the real number, good or bad",mt_n3:"failures included, always",
 r_eyebrow:"08 · Roadmap",r_h2:"Intent, not deadlines.",
 r_lead:"Consistent with the no-promises principle: the roadmap states direction, and every milestone below the audit gate stays off mainnet.",
 rm1_t:"Public foundation",rm1_p:"Whitepaper, open repository, fork simulator, tested v0 contracts.",
 rm2_t:"Contract hardening",rm2_p:"Balance-delta accounting and typed swap adapters; public dashboard fills with on-chain data.",
 rm3_v:"GATE",rm3_t:"External audit",rm3_p:"Independent review of Executor and Registry. Nothing touches mainnet before this.",
 rm4_t:"Mainnet + curriculum",rm4_p:"Polygon mainnet first; the same contracts then extend to Arbitrum and BSC, each behind its own gate. Timelocked Registry, full curriculum, second audit.",
 f_h2:"Straight answers.",
 f1_q:"Is this an investment?",f1_a:"No. Triviu is educational infrastructure and open-source tooling. It takes no deposits, manages no capital and promises no returns.",
 f2_q:"Is there a token or presale?",f2_a:"No — and none is planned. Anyone selling a \u201cTriviu token\u201d is running a scam. Report it.",
 f3_q:"Will I make money running the bot?",f3_a:"Probably not. Most opportunities are captured by professional operators with dedicated infrastructure; after gas, expected results tend toward zero or negative. That is why the risk notice sits at the top of this page.",
 f4_q:"Why Polygon?",f4_a:"Because low gas makes learning cheap — so Polygon is the default and reference chain. The same audited contracts are EVM-equivalent and extend to Arbitrum and BSC by configuration, each with its own Tradeoff Record (0001, 0004, 0005). What each chain costs — in decentralization — is documented in the open; none is \"live\" until its own audit gate clears.",
 f5_q:"Who is behind Triviu?",f5_a:"Triviu Contributors. Code, parameters, decisions and their costs are all public in the repository — judge the work, not the names.",
 cta_h2:"Start on a fork. Mistakes there are free.",cta_b1:"Open the fork guide",cta_b2:"Browse the repository",
 foot_lic:"AGPL-3.0 code · CC BY 4.0 brand · no token · no tracking",
 foot_tag:"Open source. Verifiable math. No promises.",
 foot_col:"Set in Libre Caslon Text, Public Sans & IBM Plex Mono · July 2026",
 tip_d:"Decentralization — Ultramar",tip_s:"Security — Lacre",tip_sc:"Scalability — Açafrão",
 mq:"<span>NO TOKEN</span><span>·</span><span>NON-CUSTODIAL</span><span>·</span><span>OPEN SOURCE</span><span>·</span><span>ATOMIC A→B→C→A</span><span>·</span><span>FAILURES PUBLISHED</span><span>·</span><span>DON'T TRUST — VERIFY</span><span>·</span>",
 title:"Triviu · Open source. Verifiable math. No promises."
},
es:{
 nav_protocol:"Protocolo",nav_how:"Cómo funciona",nav_math:"La matemática",nav_trilemma:"Trilema",nav_education:"Educación",nav_sim:"Simular",nav_chains:"Cadenas",nav_learn:"Aprender",nav_verify:"Verificar",nav_road:"Hoja de ruta",nav_code:"Leer el código",
 hero_eyebrow:"Protocolo abierto · EVM · Polygon primero · sin token",
 hero_h1:"No confíes.<br>Verifica.",
 hero_sub:"Triviu es un protocolo abierto y sin custodia para arbitraje triangular atómico en Polygon, con los mismos contratos auditados diseñados para Arbitrum y BSC — hecho para que tú lo leas, lo audites y lo ejecutes. Infraestructura educativa, con cada regla pública y cada límite documentado.",
 hero_cta1:"Leer el código",hero_cta2:"Leer el whitepaper",
 hero_m1:"Código <b>AGPL-3.0</b> · Marca <b>CC BY 4.0</b> · releases firmadas",
 hero_m2:"ejecutor stateless · parámetros vía PR público · auditoría antes de mainnet",
 hero_scroll:"Desplázate — el aviso de riesgo va primero",
 hero_drag:"Arrastra · gira el ciclo · toca un nodo",
 risk_t:"⚠ AVISO DE RIESGO — LECTURA OBLIGATORIA",
 risk_p:"La mayoría de las oportunidades de arbitraje atómico — en cualquier cadena — son capturadas por operadores profesionales. Para la mayoría de los usuarios individuales, el resultado esperado después del gas tiende a cero o negativo. Triviu es infraestructura educativa — no es una fuente de ingresos. Las transacciones revertidas igual pagan gas.",
 p_eyebrow:"01 · El protocolo",p_h2:"Una transacción. Tres tramos. Cero custodia.",
 p_lead:"Un ciclo triangular A→B→C→A corre dentro de una sola transacción atómica: o cierra con la ganancia mínima, o todo se revierte y ningún tramo queda expuesto. Tus llaves y tus fondos nunca nos tocan — el ejecutor es stateless por construcción.",
 c1_t:"Ejecutor atómico",c1_p:"Contrato stateless y verificado. Toma el principal del llamador, ejecuta los tramos y devuelve todo en la misma transacción — o revierte todo.",
 c2_t:"Registro de parámetros",c2_p:"Whitelists y topes on-chain. Cada cambio graba la URL de su pull request público: foro → Git → bloque.",
 c3_t:"Simulador en fork",c3_p:"Toda ruta corre primero en un fork local de la cadena objetivo. Equivocarse ahí es gratis — y esa es la idea.",
 c4_t:"Motor abierto",c4_p:"Detección de ciclos con Bellman–Ford sobre −log(tasas), escrito para ser leído. dry-run por defecto; mainnet exige aceptar el riesgo explícitamente.",
 rd1_l:"Lectura I · el nombre",rd1_t:"El trivium",rd1_p:"Latín para el encuentro de tres caminos — y el currículo clásico que fundó la educación.",
 rd2_l:"Lectura II · el producto",rd2_t:"La ruta",rd2_p:"Tres pools en un solo bucle cerrado y atómico. Termina donde empezó, o nunca ocurrió.",
 rd3_l:"Lectura III · el contexto",rd3_t:"El trilema",rd3_p:"Descentralización, seguridad, escalabilidad — un nodo cada una. Recorrido, no elegido.",
 enter0:"Desplázate para entrar · Cómo funciona",enter1:"Desplázate para entrar · La matemática",enter2:"Desplázate para entrar · El trilema",enter3:"Desplázate para entrar · Educación",enter4:"Desplázate para entrar · Léelo dos veces",enter5:"Desplázate para entrar · Hoja de ruta",enter6:"Desplázate para entrar · FAQ",
 h_eyebrow:"02 · Cómo funciona",h_h2:"Detectar. Simular. Ejecutar — o revertir.",
 h_lead:"Tres movimientos, siempre en este orden. El tercero tiene dos finales honestos, y ambos se publican.",
 s1_t:"Detectar",s1_p:"El motor abierto vigila pools de la whitelist y busca ciclos negativos sobre −log(tasas) — Bellman–Ford, en código legible.",s1_g:"off-chain · código abierto",
 s2_t:"Simular",s2_p:"Toda ruta candidata corre primero en un fork local de la cadena objetivo. Gas, slippage y motivos de revert — medidos donde equivocarse no cuesta nada.",s2_g:"fork · obligatorio",
 s3_t:"Ejecutar — o revertir",s3_p:"On-chain, el contrato impone la condición de ganancia. Se cumple: todo vuelve a tu billetera. No se cumple: toda la transacción revierte. Ambos resultados van al dashboard público.",s3_g:"atómico · sin custodia",
 m_eyebrow:"03 · La matemática",m_h2:"Toda la estrategia cabe en una condición.",
 m_lead:"Para un volumen V en el activo A, tasas efectivas r y comisiones φ, el contrato impone exactamente esto — y revierte cuando falla. Sin discreción, sin magia de dashboard: una fórmula que puedes comprobar.",
 m_c1:"// ganancia bruta del ciclo",m_c2:"// condición de ejecución — si no, toda la tx revierte",
 m_link:"Míralo implementado en el ejecutor →",
 wex_eye:"Un resultado simulado · no una proyección",wex_h:"Lo que un ciclo realmente devuelve.",
 wex_lead:"Cuatro mercados honestos, con la misma matemática que el contrato impone (1.000 en A). Mira qué raro es que uno cierre.",
 wex_l1:"Mercado justo · producto 1.0000",wex_v1:"revierte · muro de comisión",
 wex_l2:"Ventaja de 1% · producto 1.0100",wex_v2:"revierte · aún corto",
 wex_l3:"Ventaja rara de 3% · producto 1.0303",wex_v3:"+6.18 · raro",
 wex_l4:"Misma ventaja, sobredimensionado · 40.000",wex_v4:"revierte · slippage",
 wex_cta:"Corre tu propio mercado →",wex_note:"Números reales de la matemática AMM auditada — comisión 0.997 por salto, impacto de precio, gas. No es un pronóstico.",
 t_eyebrow:"04 · El trilema",t_h2:"No resolvemos el trilema. Lo recorremos.",
 t_lead:"Ninguna blockchain maximiza descentralización, seguridad y escalabilidad a la vez. La industria lo esconde con marketing; nosotros lo documentamos. Cada decisión de arquitectura llega con su Ficha de Tradeoff — y una ficha sin línea de costo es inválida.",
 t_fnum:"FICHA DE TRADEOFF N.º 0001 · DECISIÓN FUNDACIONAL",t_ftit:"Red de ejecución: Polygon PoS",
 t_ax1:"Escalabilidad<span class='chip'>GANA</span>",t_r1:"El gas bajo hace ejecutables los ciclos pequeños y abarata el error — prerrequisito de la educación práctica.",
 t_ax2:"Seguridad<span class='chip'>MANTIENE</span>",t_r2:"La atomicidad elimina la exposición por tramo; el riesgo de contrato permanece — auditoría externa antes de la v1.",
 t_ax3:"Descentralización<span class='chip'>CUESTA</span>",t_r3:"Heredamos el conjunto de validadores de Polygon. Mitigación: contratos verificados, simulación local, RPC propio.",
 t_more:"Polygon es la ficha fundacional. Los mismos contratos EVM se extienden a <b>Arbitrum</b> (Ficha 0004) y <b>BSC</b> (0005) — cada una paga un precio distinto; BSC es la más centralizada de las tres, y lo decimos. <b>Solana</b> no es EVM: un protocolo hermano diferido (0006), no una configuración. Nada está \"en vivo\" hasta que pase su propia puerta. <a href=\"/chains\">Ver las fichas de expansión →</a>",
 e_eyebrow:"05 · Educación",e_h2:"Apréndelo antes de ejecutarlo.",
 e_lead:"Un currículo público, enseñado por una persona sintética identificada como IA en cada video y cada biografía — siempre. La regla editorial no se negocia: mostrar tecnología, nunca ingresos.",
 e1_t:"AMMs desde cero",e1_p:"Cómo los pools fijan precios, y por qué eso crea las discrepancias que el arbitraje cierra.",
 e2_t:"Anatomía de un ciclo real",e2_p:"Gas, slippage, competencia — los números de una transacción real, bloque a bloque.",
 e3_t:"Ejecútalo tú mismo",e3_p:"Lee el código con la persona y ejecútalo en un fork, donde equivocarse es gratis.",
 e4_t:"Billetera y MEV",e4_p:"Seguridad de llaves, higiene de approvals y cómo ganan de verdad los searchers profesionales.",
 e_badge:"— la insignia que lleva todo contenido de la persona, por regla.",
 e_course:"Abrir el curso completo →",
 n_eyebrow:"06 · Léelo dos veces",n_h2:"Lo que Triviu no es.",
 n1:"No custodia fondos — no existe función de depósito en ningún lugar.",
 n2:"No tiene token, preventa ni asignación — y no hay planes de tenerlos.",
 n3:"No vende señales, grupos premium ni estrategias \u201cgarantizadas\u201d.",
 n4:"No promete rendimientos. Posibilidad no es probabilidad.",
 n_nota:"Si alguien ofrece cualquiera de estas cosas en nombre de Triviu, es una estafa — denúnciala. Las únicas superficies oficiales son este sitio y el repositorio público.",
 v_eyebrow:"07 · No confíes: verifica",v_h2:"Todo lo que afirmamos, lo puedes comprobar.",
 v_th1:"Qué",v_th2:"Dónde",
 v_r1:"Whitepaper — el documento fundador",v_r2:"Contratos, v0 — probados, auditoría externa pendiente",v_r3:"Decisiones y sus costos (Fichas de Tradeoff)",v_r4:"Direcciones verificadas en el explorador de cada cadena",v_r5:"Dashboard público — fallos incluidos",
 v_soon1:"en el deploy a mainnet, tras la auditoría externa",v_soon2:"en vivo · triviu.vercel.app/dashboard",
 mt1_l:"Ejecuciones · incl. reverts",mt2_l:"Tasa de reversión · 30d",mt3_l:"Gas gastado vs. resultado neto",
 mt_n:"tras el deploy a mainnet",mt_n2:"el número real, bueno o malo",mt_n3:"fallos incluidos, siempre",
 r_eyebrow:"08 · Hoja de ruta",r_h2:"Intención, no plazos.",
 r_lead:"Coherente con el principio de no prometer: la hoja de ruta declara dirección, y todo hito antes de la puerta de auditoría queda fuera de mainnet.",
 rm1_t:"Fundación pública",rm1_p:"Whitepaper, repositorio abierto, simulador en fork, contratos v0 probados.",
 rm2_t:"Endurecimiento del contrato",rm2_p:"Contabilidad por delta de saldo y adaptadores de swap tipados; el dashboard público se llena con datos on-chain.",
 rm3_v:"PUERTA",rm3_t:"Auditoría externa",rm3_p:"Revisión independiente del Ejecutor y del Registro. Nada toca mainnet antes de esto.",
 rm4_t:"Mainnet + currículo",rm4_p:"Polygon mainnet primero; los mismos contratos luego se extienden a Arbitrum y BSC, cada una tras su propia puerta. Registro con timelock, currículo completo, segunda auditoría.",
 f_h2:"Respuestas directas.",
 f1_q:"¿Esto es una inversión?",f1_a:"No. Triviu es infraestructura educativa y herramientas de código abierto. No recibe depósitos, no gestiona capital y no promete rendimientos.",
 f2_q:"¿Hay token o preventa?",f2_a:"No — y no hay planes. Quien venda un \u201ctoken de Triviu\u201d está montando una estafa. Denúncialo.",
 f3_q:"¿Ganaré dinero ejecutando el bot?",f3_a:"Probablemente no. La mayoría de las oportunidades las capturan operadores profesionales con infraestructura dedicada; después del gas, el resultado esperado tiende a cero o negativo. Por eso el aviso de riesgo está en la parte superior de esta página.",
 f4_q:"¿Por qué Polygon?",f4_a:"Porque el gas bajo abarata el aprendizaje — por eso Polygon es la cadena por defecto y de referencia. Los mismos contratos auditados son equivalentes a EVM y se extienden a Arbitrum y BSC por configuración, cada una con su Ficha de Tradeoff (0001, 0004, 0005). Lo que cada cadena cuesta — en descentralización — está documentado a la vista; ninguna está \"en vivo\" hasta que pase su propia puerta de auditoría.",
 f5_q:"¿Quién está detrás de Triviu?",f5_a:"Triviu Contributors. Código, parámetros, decisiones y sus costos son públicos en el repositorio — juzga el trabajo, no los nombres.",
 cta_h2:"Empieza en un fork. Equivocarse ahí es gratis.",cta_b1:"Abrir la guía de fork",cta_b2:"Explorar el repositorio",
 foot_lic:"Código AGPL-3.0 · Marca CC BY 4.0 · sin token · sin rastreo",
 foot_tag:"Código abierto. Matemática verificable. Ninguna promesa.",
 foot_col:"Compuesto en Libre Caslon Text, Public Sans e IBM Plex Mono · Julio 2026",
 tip_d:"Descentralización — Ultramar",tip_s:"Seguridad — Lacre",tip_sc:"Escalabilidad — Açafrão",
 mq:"<span>SIN TOKEN</span><span>·</span><span>SIN CUSTODIA</span><span>·</span><span>CÓDIGO ABIERTO</span><span>·</span><span>ATÓMICO A→B→C→A</span><span>·</span><span>FALLOS PUBLICADOS</span><span>·</span><span>NO CONFÍES — VERIFICA</span><span>·</span>",
 title:"Triviu · Código abierto. Matemática verificable. Ninguna promesa."
}};

function setLang(lang){
  LANG=lang;
  var dict=T[lang];
  document.querySelectorAll("[data-i18n]").forEach(function(el){
    var k=el.getAttribute("data-i18n");
    if(dict[k]!==undefined) el.innerHTML=dict[k];
  });
  document.getElementById("mq-track").innerHTML=dict.mq+dict.mq;
  document.documentElement.lang=lang;
  document.title=dict.title;
  document.getElementById("btn-en").setAttribute("aria-pressed",lang==="en");
  document.getElementById("btn-es").setAttribute("aria-pressed",lang==="es");
}

/* Os botoes EN/ES traziam onclick="setLang('…')" no HTML. Handler em atributo e
   script inline: com script-src 'self' e sem 'unsafe-inline', o navegador o
   recusa e o seletor de idioma morre calado. O listener abaixo faz o mesmo
   trabalho, no padrao addEventListener que positions/index.html ja usa. */
document.getElementById("btn-en").addEventListener("click",function(){setLang("en")});
document.getElementById("btn-es").addEventListener("click",function(){setLang("es")});

/* ================= 3D — o Ciclo ancorado à própria coluna ================= */
/* Correção central: o objeto é projetado matematicamente no retângulo de
   #stage-hit (a coluna reservada do hero) — nunca sobre o texto. Ao rolar,
   ele acompanha o hero para cima e faz a transição para um posto ambiente
   no canto superior direito, girando 120° por seção. */
var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var three={ok:false};
var OBJ_W=3.3; // largura do objeto no mundo (nós r=1 + arcos f=0.6 + esferas)

function init3D(){
  if(typeof THREE==="undefined"){document.body.classList.add("no3d");return}
  try{
    var canvas=document.getElementById("scene");
    var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
    renderer.setClearColor(0xFAFAF7,1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    var scene=new THREE.Scene();
    var camera=new THREE.PerspectiveCamera(38,1,0.1,60);
    camera.position.set(0,0,6);
    scene.add(new THREE.HemisphereLight(0xffffff,0xDDE0DA,1.05));
    var dir=new THREE.DirectionalLight(0xffffff,0.65);dir.position.set(3,4,5);scene.add(dir);

    var outer=new THREE.Group(),inner=new THREE.Group();
    outer.add(inner);scene.add(outer);

    var NODES=[
      {p:[-0.5, 0.866,0],c:0x2743C7,tip:"tip_d"},
      {p:[ 1.0, 0.0  ,0],c:0xC13327,tip:"tip_s"},
      {p:[-0.5,-0.866,0],c:0xE8B23A,tip:"tip_sc"}
    ];
    var inkMats=[],spheres=[];
    function v(a){return new THREE.Vector3(a[0],a[1],a[2])}
    function arc(a,b){
      var mid=v(a).add(v(b)).multiplyScalar(0.5);
      var ctrl=mid.clone().multiplyScalar(1.6);
      var curve=new THREE.QuadraticBezierCurve3(v(a),ctrl,v(b));
      var mat=new THREE.MeshStandardMaterial({color:0x16181D,roughness:0.5,metalness:0.05});
      inkMats.push(mat);
      inner.add(new THREE.Mesh(new THREE.TubeGeometry(curve,48,0.055,12,false),mat));
      var cone=new THREE.Mesh(new THREE.ConeGeometry(0.075,0.17,16),mat);
      cone.position.copy(curve.getPointAt(0.5));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),curve.getTangentAt(0.5).normalize());
      inner.add(cone);
    }
    arc(NODES[0].p,NODES[1].p);arc(NODES[1].p,NODES[2].p);arc(NODES[2].p,NODES[0].p);
    NODES.forEach(function(n){
      var m=new THREE.Mesh(new THREE.SphereGeometry(0.15,32,24),
        new THREE.MeshStandardMaterial({color:n.c,roughness:0.35,metalness:0.1}));
      m.position.set(n.p[0],n.p[1],n.p[2]);m.userData.tip=n.tip;m.userData.hex=n.c;
      inner.add(m);spheres.push(m);
    });

    var pts=new THREE.BufferGeometry(),N=260,arr=new Float32Array(N*3);
    for(var i=0;i<N*3;i++)arr[i]=(Math.random()-0.5)*15;
    pts.setAttribute("position",new THREE.BufferAttribute(arr,3));
    var cloud=new THREE.Points(pts,new THREE.PointsMaterial({color:0x52575D,size:0.022,transparent:true,opacity:0.35}));
    scene.add(cloud);

    three={ok:true,renderer:renderer,scene:scene,camera:camera,outer:outer,inner:inner,
           spheres:spheres,inkMats:inkMats,cloud:cloud,
           anchor:{x:1.6,y:0,scale:1,docY:0,visH:4,visW:7,ppw:0.004},
           tgt:{rx:0,ry:0,spin:0,px:0,py:0},cur:{rx:0,ry:0,spin:0,px:0,py:0},vel:0,
           inkCur:new THREE.Color(0x16181D),inkTgt:new THREE.Color(0x16181D)};
    resize3D();render3D();
    if(!reduce)requestAnimationFrame(loop3D);
  }catch(e){document.body.classList.add("no3d")}
}
function computeAnchor(){
  // projeta o centro de #stage-hit para coordenadas de mundo no plano z=0
  var a=three.anchor,cam=three.camera;
  a.visH=2*cam.position.z*Math.tan(THREE.MathUtils.degToRad(cam.fov/2));
  a.visW=a.visH*cam.aspect;
  a.ppw=a.visW/window.innerWidth; // mundo por pixel
  var r=document.getElementById("stage-hit").getBoundingClientRect();
  var cx=r.left+r.width/2, cyDoc=r.top+window.scrollY+r.height/2;
  a.x=((cx/window.innerWidth)-0.5)*a.visW;
  a.docY=cyDoc; // posição no documento; convertida por frame conforme o scroll
  var fitW=r.width*0.96*a.ppw, fitH=r.height*0.96*(a.visH/window.innerHeight);
  a.scale=Math.min(fitW,fitH)/OBJ_W;
}
function resize3D(){
  if(!three.ok)return;
  var w=window.innerWidth,h=window.innerHeight;
  three.renderer.setSize(w,h,false);
  three.camera.aspect=w/h;three.camera.updateProjectionMatrix();
  computeAnchor();onScroll3D();
}
function onScroll3D(){
  if(!three.ok)return;
  var a=three.anchor;
  var max=document.documentElement.scrollHeight-window.innerHeight;
  var p=max>0?window.scrollY/max:0;
  three.tgt.spin=-p*9*(Math.PI*2/3); // 120° por seção

  // posição ancorada ao hero (sobe junto com a página)...
  var heroY=-((a.docY-window.scrollY)/window.innerHeight-0.5)*a.visH;
  // ...e posto ambiente no canto superior direito (área livre da margem)
  var postX=Math.max(a.visW/2-1.05,0), postY=a.visH/2-1.35;
  var postS=Math.max(0.3,a.scale*0.42);
  var t=Math.min(1,Math.max(0,(p-0.015)/0.11)); t=t*t*(3-2*t); // suave
  var x=a.x+(postX-a.x)*t;
  var y=heroY+(postY-heroY)*t;
  var s=a.scale+(postS-a.scale)*t;
  three.outer.position.set(x,y,0);
  three.outer.scale.setScalar(s);
  if(reduce){snap3D();render3D()}
}
function snap3D(){
  var c=three.cur,t=three.tgt;
  c.rx=t.rx;c.ry=t.ry;c.spin=t.spin;c.px=t.px;c.py=t.py;apply3D();
}
function apply3D(){
  var c=three.cur;
  three.inner.rotation.x=c.rx;three.inner.rotation.y=c.ry;
  three.outer.rotation.z=c.spin;
  three.camera.position.x=c.px;three.camera.position.y=c.py;
  three.camera.lookAt(0,0,0);
  three.inkCur.lerp(three.inkTgt,0.08);
  three.inkMats.forEach(function(m){m.color.copy(three.inkCur)});
}
function render3D(){if(three.ok)three.renderer.render(three.scene,three.camera)}
function loop3D(t){
  if(!three.ok)return;
  if(!document.hidden){
    var c=three.cur,g=three.tgt,k=0.09;
    // inércia do arraste
    g.ry+=three.vel;three.vel*=0.94;
    c.rx+=(g.rx-c.rx)*k;c.ry+=(g.ry-c.ry)*k;
    c.spin+=((g.spin-(t*0.00005))-c.spin)*0.05;
    c.px+=(g.px-c.px)*0.06;c.py+=(g.py-c.py)*0.06;
    three.cloud.rotation.y+=0.0004;
    apply3D();render3D();
  }
  requestAnimationFrame(loop3D);
}

/* ---------- toque, arraste (com inércia) e tap nos nós ---------- */
(function(){
  var hit=document.getElementById("stage-hit"),tip=document.getElementById("tip"),
      tipTxt=document.getElementById("tip-txt"),tipDot=tip.querySelector(".dot"),
      down=false,moved=0,lx=0,ly=0,tipTimer=null;
  function pos(e){var t=e.touches?e.touches[0]:e;return{x:t.clientX,y:t.clientY}}
  function start(e){if(!three.ok)return;down=true;moved=0;three.vel=0;var p=pos(e);lx=p.x;ly=p.y;hit.classList.add("dragging")}
  function move(e){
    if(!three.ok)return;
    var p=pos(e);
    if(down){
      var dx=p.x-lx,dy=p.y-ly;lx=p.x;ly=p.y;moved+=Math.abs(dx)+Math.abs(dy);
      three.tgt.ry+=dx*0.008;three.vel=dx*0.0016;
      three.tgt.rx=Math.max(-0.9,Math.min(0.9,three.tgt.rx+dy*0.008));
      if(reduce){snap3D();render3D()}
      if(e.cancelable)e.preventDefault();
    }else if(!reduce){
      three.tgt.px=(p.x/window.innerWidth-0.5)*0.3;
      three.tgt.py=-(p.y/window.innerHeight-0.5)*0.22;
    }
  }
  function end(e){
    if(!three.ok)return;
    hit.classList.remove("dragging");
    if(down&&moved<8){
      var p=(e.changedTouches?e.changedTouches[0]:e);
      var ndc=new THREE.Vector2((p.clientX/window.innerWidth)*2-1,-(p.clientY/window.innerHeight)*2+1);
      var ray=new THREE.Raycaster();ray.setFromCamera(ndc,three.camera);
      var hits=ray.intersectObjects(three.spheres);
      if(hits.length){
        var s=hits[0].object;
        tipTxt.textContent=T[LANG][s.userData.tip];
        tipDot.style.background="#"+s.userData.hex.toString(16).padStart(6,"0");
        tip.style.left=p.clientX+"px";tip.style.top=p.clientY+"px";
        tip.classList.add("on");
        clearTimeout(tipTimer);tipTimer=setTimeout(function(){tip.classList.remove("on")},2600);
      }
    }
    down=false;
  }
  hit.addEventListener("pointerdown",start);
  window.addEventListener("pointermove",move,{passive:false});
  window.addEventListener("pointerup",end);
  hit.addEventListener("touchstart",start,{passive:true});
  window.addEventListener("touchmove",move,{passive:false});
  window.addEventListener("touchend",end);
  window.addEventListener("scroll",onScroll3D,{passive:true});
  window.addEventListener("resize",resize3D);
  window.addEventListener("load",resize3D);
})();

/* ---------- seção escura: tinta vira papel ---------- */
(function(){
  var dark=document.getElementById("not");
  if(!("IntersectionObserver" in window))return;
  new IntersectionObserver(function(es){es.forEach(function(en){
    if(!three.ok)return;
    three.inkTgt.set(en.isIntersecting?0xFAFAF7:0x16181D);
    if(reduce){three.inkCur.copy(three.inkTgt);apply3D();render3D()}
  })},{threshold:0.35}).observe(dark);
})();

/* ---------- loader ---------- */
(function(){
  var loader=document.getElementById("loader"),pct=document.getElementById("pct"),mk=document.getElementById("loader-mark");
  if(reduce){loader.classList.add("done");init3D();return}
  var n=0;
  var iv=setInterval(function(){
    n=Math.min(100,n+Math.ceil(Math.random()*9));
    pct.textContent=n;
    mk.style.transform="rotate("+(Math.floor(n/34)*120)+"deg)";
    if(n>=100){clearInterval(iv);init3D();setTimeout(function(){loader.classList.add("done")},150)}
  },40);
})();

/* ---------- revelação ---------- */
(function(){
  if(!("IntersectionObserver" in window))return;
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}
  })},{threshold:0.12});
  document.querySelectorAll(".reveal").forEach(function(el){io.observe(el)});
})();
