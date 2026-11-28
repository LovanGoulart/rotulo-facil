"use strict";
const $ = id => document.getElementById(id);
(function setupInstallBanner() {
  const standalone = window.matchMedia?.("(display-mode: standalone)") ?? {matches:false};
  const key = "rotulo.instalado";
  let installed = false;
  let dismissed = false;
  let promptEvent = null;
  let prompting = false;
  try { installed = localStorage.getItem(key) === "1"; } catch {}
  function remember(value) {
    installed = value;
    try { localStorage.setItem(key, value ? "1" : "0"); } catch {}
  }
  function render() {
    const inApp = standalone.matches || navigator.standalone === true;
    if (inApp) remember(true);
    $("installNote").hidden = inApp || dismissed;
    $("installText").hidden = !installed;
    $("installAction").hidden = installed;
    $("installAction").disabled = prompting;
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptEvent = event;
    remember(false);
    render();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    remember(true);
    render();
  });
  window.addEventListener("storage", event => {
    if (event.key === key) { installed = event.newValue === "1"; render(); }
  });
  $("closeInstall").onclick = () => {
    dismissed = true;
    render();
    const target = $("home").hidden ? $("title") : $("home").querySelector("h1");
    target.focus({preventScroll:true});
  };
  if (/Android/i.test(navigator.userAgent) && location.protocol === "https:") {
    const launch = $("installText");
    launch.target = "_self";
    launch.href = "intent://" + location.host + "/#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=" + encodeURIComponent(location.origin + "/#abrir-app") + ";end";
  }
  if (location.hash === "#abrir-app" && !standalone.matches) {
    $("installSteps").textContent = "Para abrir o Rótulo Fácil instalado, toque no ícone dele na tela inicial do aparelho.";
    $("installHelp").showModal();
    history.replaceState(null, "", location.pathname + location.search);
  }
  standalone.addEventListener?.("change", render);
  function help() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let steps = "No menu do navegador, escolha Instalar aplicativo ou Adicionar à tela inicial.";
    if (ios) {
      steps = "Abra este site no Safari. Toque em Compartilhar, escolha Adicionar à Tela de Início e confirme.";
    } else if (/Android/i.test(navigator.userAgent)) {
      steps = "Se abriu pelo WhatsApp ou outro aplicativo, toque em ⋮ e escolha Abrir no Chrome. No Chrome, toque em ⋮, escolha Adicionar à tela inicial e depois Instalar.";
    }
    $("installSteps").textContent = steps;
    $("installHelp").showModal();
  }
  $("installAction").onclick = async () => {
    if (!promptEvent) { help(); return; }
    const event = promptEvent;
    promptEvent = null;
    prompting = true;
    render();
    try {
      await event.prompt();
      await event.userChoice;
    } catch { help(); }
    finally { prompting = false; render(); }
  };
  render();
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(apps => {
      if (apps.some(app => app.platform === "webapp" &&
          app.url && new URL(app.url, location.href).href === location.origin + "/manifest.json")) {
        remember(true);
        render();
      }
    }).catch(() => {});
  }
  const bar = document.querySelector("header");
  const note = $("installNote");
  function measure() {
    const style = document.documentElement.style;
    style.setProperty("--topbar", bar.offsetHeight + "px");
    style.setProperty("--notice", (note.offsetHeight ? note.offsetHeight + 12 : 0) + "px");
  }
  measure();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(note);
  } else {
    window.addEventListener("resize", measure);
  }
})();

const br = (value, digits = 2) => value.toLocaleString("pt-BR", {maximumFractionDigits:digits});
const money = value => value.toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
const periods = ["Minuto","Hora","Dia","Mês (30 dias)","Ano"];
const nutrients = {kcal:"Energia",carboidratos:"Carboidratos",proteinas:"Proteínas",gorduras:"Gorduras"};
const mealKey = "rotulo.refeicao.v1";
let mode, item, photo, previewUrl, period = 3, request, revision = 0, library;
let comparing = false, editingSlot = 0, devices = [];
let distributors = [], selectedDistributor, distributorRequest, appliedTariff;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(text, fn) {
  const node = el("button", text);
  node.onclick = fn;
  return node;
}
function say(message) { $("status").textContent = message; }
function validFood(food) {
  return food && typeof food.nome === "string" && typeof food.porcao === "string" &&
    Object.keys(nutrients).every(k => Number.isFinite(food[k]) && food[k] >= 0);
}
function loadMeal() {
  try {
    const data = JSON.parse(localStorage.getItem(mealKey) || "[]");
    return Array.isArray(data) ? data.filter(validFood) : [];
  } catch { return []; }
}
let meal = loadMeal();
function saveMeal(next) {
  try { localStorage.setItem(mealKey, JSON.stringify(next)); }
  catch { say("O navegador não conseguiu salvar a refeição. Verifique o espaço disponível."); return false; }
  meal = next;
  drawMeal();
  return true;
}
function resetPhoto() {
  revision++;
  request?.abort();
  request = null;
  photo = item = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $("preview").removeAttribute("src");
  for (const id of ["confirmPhoto","resultBox","controls"]) $(id).hidden = true;
  $("region").disabled = false;
  say("");
}
function openMode(next) {
  comparing = false;
  $("compareGuide").hidden = true;
  $("calculateDevice").textContent = "Calcular consumo";
  $("analyzePhoto").textContent = "🔍 Analisar foto";
  $("comparison").hidden = true;
  $("photoPanel").hidden = false;
  closeDistributorList();
  resetPhoto();
  mode = next;
  $("manualEnergy").hidden = mode !== "energia";
  updateAnalyzeButton();
  $("work").hidden = !mode;
  $("home").hidden = Boolean(mode);
  $("region").hidden = mode !== "energia";
  $("title").textContent = mode === "energia" ? "Consumo de energia" : "Tabela nutricional";
  $("tip").textContent = mode === "energia" ? "Enquadre a potência em W ou o consumo em kWh/mês." : "Inclua a porção e as quatro linhas de energia, carboidratos, proteínas e gorduras.";
  drawMeal();
  if (mode === "energia" && !distributors.length) loadDistributors();
  (mode ? $("title") : $("home").querySelector("h1")).focus();
}
for (const node of document.querySelectorAll("[data-mode]")) node.onclick = () => openMode(node.dataset.mode);
$("back").onclick = () => {
  if (!$("resultScreen").hidden) {
    showAnalysisResult(false);
    history.replaceState(null, "", location.pathname + location.search);
  }
  openMode(null);
};
function showAnalysisResult(show) {
  $("compareOther").hidden = !show || mode !== "energia" || comparing;
  $("foodControls").hidden = !show || mode !== "nutricao";
  $("resultScreen").hidden = !show;
  $("work").hidden = show;
  $("backResult").hidden = !show;
  document.body.classList.toggle("show-analysis-result", show);
  for (const id of ["controls", "resultBox"]) {
    const panel = $(id);
    panel.hidden = !show || (id === "controls" && (mode !== "energia" || comparing));
    if (show) $("resultScreen").append(panel);
    else $("mealBox").before(panel);
  }
  say("");
  window.scrollTo(0, 0);
  (show ? $("result") : comparing ? $("compareRun") : item?.manual ? $("calculateDevice") : $("pick")).focus({preventScroll:show});
}
if (location.hash === "#resultado") history.replaceState(null, "", location.pathname + location.search);
window.addEventListener("popstate", () => {
  if (item && history.state?.analysisResult === revision) showAnalysisResult(true);
  else if (!$("resultScreen").hidden) showAnalysisResult(false);
});
$("backResult").onclick = () => history.back();

async function getJSON(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Solicitação indisponível.");
  return data;
}
function showTariffStatus(text) { $("reference").textContent = text; }
async function loadDistributors() {
  if (distributorRequest) return;
  const controller = new AbortController();
  distributorRequest = controller;
  showTariffStatus("Carregando distribuidoras da ANEEL…");
  try {
    const data = await getJSON("/api/energia/distribuidoras", {signal:controller.signal,cache:"no-store"});
    const counts = new Map();
    for (const {nome} of data) counts.set(nome,(counts.get(nome) ?? 0) + 1);
    distributors = data.sort((a,b) => a.nome.localeCompare(b.nome,"pt-BR")).map(({nome,cnpj}) => ({
      nome:normalizeDistributorName(nome),
      cnpj,
      label:counts.get(nome) > 1 ? nome + " · CNPJ " + cnpj : nome,
    }));
    $("distributor").disabled = false;
    showTariffStatus("");
  } catch {
    showTariffStatus("Não foi possível carregar as distribuidoras. Reabra o módulo para tentar novamente.");
  } finally {
    distributorRequest = null;
  }
}
function normalizeDistributorName(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
const distributorField = $("distributor");
const distributorOptions = $("distributorOptions");
function closeDistributorList() {
  distributorOptions.hidden = true;
  distributorField.setAttribute("aria-expanded","false");
  distributorField.removeAttribute("aria-activedescendant");
}
function renderDistributorList(query) {
  const text = query.trim();
  const digits = /^[0-9./\s-]+$/.test(text) ? text.replace(/\D/g,"") : "";
  const terms = normalizeDistributorName(text).split(" ");
  const matches = distributors.filter(({nome,cnpj}) =>
    digits ? cnpj.includes(digits) : terms.every(term => nome.includes(term))
  );
  const rows = matches.map(({label,cnpj}) => {
    const row = el("li",label);
    row.id = "distributor-" + cnpj;
    row.dataset.cnpj = cnpj;
    row.setAttribute("role","option");
    row.setAttribute("aria-selected","false");
    return row;
  });
  if (!rows.length) rows.push(el("li","Nenhuma distribuidora encontrada","muted"));
  distributorOptions.replaceChildren(...rows);
  distributorOptions.hidden = false;
  distributorOptions.scrollTop = 0;
  distributorField.removeAttribute("aria-activedescendant");
  distributorField.setAttribute("aria-expanded","true");
}
function chooseDistributor(option) {
  selectedDistributor = distributors.find(({cnpj}) => cnpj === option.dataset.cnpj);
  distributorField.value = selectedDistributor.label;
  closeDistributorList();
  loadTariff();
}
function finishDistributorInput() {
  if (distributorOptions.hidden) return;
  const text = distributorField.value.trim();
  const normalized = normalizeDistributorName(text);
  const exact = [...distributorOptions.querySelectorAll("[role=option]")].filter(option =>
    normalizeDistributorName(option.textContent) === normalized ||
    (/^[0-9./-]+$/.test(text) && option.dataset.cnpj === text.replace(/\D/g,""))
  );
  if (!selectedDistributor && exact.length === 1) chooseDistributor(exact[0]);
  else closeDistributorList();
}
function openDistributorList() {
  if (distributorOptions.hidden) renderDistributorList(selectedDistributor ? "" : distributorField.value);
}
distributorField.onfocus = distributorField.onclick = openDistributorList;
distributorField.oninput = () => {
  if (selectedDistributor) {
    selectedDistributor = null;
    loadTariff();
  }
  renderDistributorList(distributorField.value);
};
distributorField.onkeydown = event => {
  if (event.isComposing) return;
  if (event.key === "Tab") { finishDistributorInput(); return; }
  if (event.key === "Escape") {
    if (!distributorOptions.hidden) { event.preventDefault(); closeDistributorList(); }
    return;
  }
  const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
  if (!arrow && event.key !== "Enter") return;
  if (arrow) {
    event.preventDefault();
    openDistributorList();
  }
  if (distributorOptions.hidden) return;
  const options = [...distributorOptions.querySelectorAll("[role=option]")];
  if (!options.length) return;
  const index = options.findIndex(option => option.id === distributorField.getAttribute("aria-activedescendant"));
  if (event.key === "Enter") {
    if (index >= 0 || options.length === 1) {
      event.preventDefault();
      chooseDistributor(options[Math.max(index,0)]);
    }
    return;
  }
  const next = event.key === "ArrowDown" ? Math.min(index+1,options.length-1) : index < 0 ? options.length-1 : Math.max(index-1,0);
  options[index]?.setAttribute("aria-selected","false");
  options[next].setAttribute("aria-selected","true");
  distributorField.setAttribute("aria-activedescendant",options[next].id);
  options[next].scrollIntoView({block:"nearest"});
};
distributorOptions.onmousedown = event => {
  if (event.target.closest("[role=option]")) event.preventDefault();
};
distributorOptions.onclick = event => {
  const option = event.target.closest("[role=option]");
  if (!option) return;
  chooseDistributor(option);
  if (event.pointerType === "touch") distributorField.blur();
};
document.addEventListener("pointerdown", event => {
  if (!$("distributorPicker").contains(event.target)) finishDistributorInput();
});
const dateBR = value => value.split("-").reverse().join("/");
const rateText = value => "R$ " + br(value,8) + "/kWh";
const baseNote = data => data.base_local ? " Dados da ANEEL de " + dateBR(data.dados_gerados_em) + " (cópia local)." : "";
const officialNote = "Tarifa residencial convencional da ANEEL, sem bandeira. Tributos e outras cobranças podem alterar o valor da fatura.";
async function loadTariff() {
  updateAnalyzeButton();
  distributorRequest?.abort();
  distributorRequest = null;
  const cnpj = selectedDistributor?.cnpj;
  if (!cnpj) { showTariffStatus(""); return; }
  const controller = new AbortController();
  distributorRequest = controller;
  showTariffStatus("Consultando a tarifa da ANEEL…");
  try {
    const data = await getJSON("/api/energia/tarifa/" + cnpj, {signal:controller.signal,cache:"no-store"});
    if (controller.signal.aborted) return;
    distributorRequest = null;

    showTariffStatus(rateText(data.valor_kwh) + " · Vigência até " + dateBR(data.fim) + ". " + officialNote + baseNote(data));
  } catch {
    if (!controller.signal.aborted) showTariffStatus("Não foi possível consultar a tarifa. Selecione novamente a distribuidora ou informe o valor da fatura.");
  } finally {
    if (distributorRequest === controller) distributorRequest = null;
  }
}
function manualRate() {
  const value = $("rate").value.trim();
  if (!value) return null;
  return /^\d+(?:[.,]\d{1,8})?$/.test(value) && Number.isFinite(Number(value.replace(",", "."))) ? Number(value.replace(",", ".")) : NaN;
}
function validateManualRate() {
  const valid = !Number.isNaN(manualRate());
  $("rate").setAttribute("aria-invalid", String(!valid));
  $("rateError").hidden = valid;
  return valid;
}
$("rate").oninput = validateManualRate;

$("snap").onclick = () => $("camera").click();
$("pick").onclick = () => $("gallery").click();
async function selectPhoto(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  resetPhoto();
  const version = revision;
  const url = URL.createObjectURL(file);
  try {
    if (file.size > 32*1024*1024) throw Error();
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1700/Math.max(img.width,img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(img.width*scale));
    canvas.height = Math.max(1,Math.round(img.height*scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",.84));
    if (!blob) throw Error();
    if (revision !== version) return;
    photo = blob;
    previewUrl = URL.createObjectURL(blob);
    $("preview").src = previewUrl;
    $("confirmPhoto").hidden = false;
    updateAnalyzeButton();
    if (!$("analyzePhoto").disabled) $("analyzePhoto").focus();
  } catch { if (revision === version) say("Não foi possível abrir a foto. Escolha um JPEG ou PNG de até 32 MB."); }
  finally { URL.revokeObjectURL(url); }
}
$("gallery").onchange = $("camera").onchange = selectPhoto;
$("analyzePhoto").onclick = () => analyzePhoto();
$("deviceUnit").onchange = () => {
  const monthly = $("deviceUnit").value === "mensal";
  $("deviceValueLabel").textContent = monthly ? "Consumo mensal (kWh/mês)" : "Potência (W)";
  $("referenceHoursBox").hidden = !monthly;
  $("deviceValue").value = "";
};
$("deviceForm").onsubmit = event => {
  event.preventDefault();
  if (mode !== "energia" || request || !selectedDistributor) return;
  const number = input => /^\d+(?:[.,]\d+)?$/.test(input.value.trim()) ? Number(input.value.trim().replace(",",".")) : NaN;
  const value = number($("deviceValue"));
  const monthly = $("deviceUnit").value === "mensal";
  const hours = monthly && $("referenceHours").value.trim() ? number($("referenceHours")) : null;
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) {
    say("Informe um valor positivo de potência ou consumo, de até 1.000.000."); $("deviceValue").focus(); return;
  }
  if (hours !== null && (!(hours > 0) || hours > 24)) {
    say("Informe as horas de referência entre 0 e 24, acima de zero."); $("referenceHours").focus(); return;
  }
  const name = $("deviceName").value.trim();
  if (!name) { $("deviceName").focus(); return; }
  analyzePhoto({nome:name, watts:monthly ? null : value, mensal:monthly ? value : null,
    horas_referencia:hours, continuo:false, manual:true});
};
function updateAnalyzeButton() {
  const missing = mode === "energia" && !selectedDistributor;
  $("analyzePhoto").disabled = !photo || Boolean(request) || missing;
  $("needDistributor").hidden = !missing;
  $("compareRun").disabled = !selectedDistributor || !devices[0] || !devices[1] || Boolean(request) || editingSlot !== -1;
  $("calculateDevice").disabled = Boolean(request) || !selectedDistributor;
}
async function analyzePhoto(device = null) {
  if ((!device && !photo) || request) return;
  const manual = mode === "energia" ? manualRate() : null;
  if (mode === "energia" && !validateManualRate()) { $("rate").focus(); return; }
  const cnpj = selectedDistributor?.cnpj;
  if (mode === "energia" && (!cnpj || (manual === null && distributorRequest))) {
    say(distributorRequest ? "Aguarde o carregamento das distribuidoras ou da tarifa." : "Selecione a distribuidora antes de analisar a foto.");
    ($("distributor").disabled ? $("rate") : $("distributor")).focus();
    return;
  }
  const version = revision;
  request = new AbortController();
  updateAnalyzeButton();
  const controller = request;
  const timer = setTimeout(() => controller.abort(), 75000);
  if (mode === "energia") $("region").disabled = true;
  say(device ? "Calculando consumo…" : "Lendo a etiqueta…");
  try {
    if (mode === "energia") {
      appliedTariff = manual === null
        ? await getJSON("/api/energia/tarifa/" + cnpj, {signal:controller.signal,cache:"no-store"})
        : {valor_kwh:manual, distribuidora:selectedDistributor?.label ?? ""};
    }
    const data = device ?? await getJSON(mode === "energia" ? "/api/energia?cnpj=" + encodeURIComponent(cnpj) : "/api/nutricao", {method:"POST",body:photo,signal:controller.signal,headers:{"Content-Type":"image/jpeg"}});
    if (version !== revision) return;
    if (comparing) {
      devices[editingSlot] = data;
      $("compCapacity"+editingSlot).value = data.capacidade ?? "";
      $("compPrice"+editingSlot).value = "";
      $("compHours"+editingSlot).value = "";
      configureSlot(editingSlot === 0 && !devices[1] ? 1 : -1);
      return;
    }
    item = data;
    if (mode === "energia") {
      period = 3;
      $("hours").value = item.horas_referencia ?? (item.continuo || item.mensal && !item.watts ? 24 : 1);
      drawEnergy();
    } else {
      const slider = $("foodAmount");
      const measure = foodMeasure(item);
      slider.step = measure.unit === "g" ? 5 : 0.25;
      slider.max = measure.unit === "g" ? 300 : 4;
      slider.value = measure.unit === "g" ? Math.max(5, 5 * Math.round(measure.base / 5)) : 1;
      drawFood();
    }
    history.pushState({analysisResult:version}, "", "#resultado");
    showAnalysisResult(true);
  } catch (e) {
    if (version === revision) say(e instanceof TypeError || e instanceof SyntaxError || e.name === "AbortError" ? "Não foi possível concluir a leitura. Confira a conexão e tente novamente." : e.message);
  } finally {
    clearTimeout(timer);
    if (version === revision) {
      request = null;
      updateAnalyzeButton();
      $("region").disabled = false;
    }
  }
};
periods.forEach((label,i) => $("periods").append(button(label, () => { period = i; drawEnergy(); })));
$("hours").oninput = drawEnergy;
function configureSlot(slot) {
  editingSlot = slot;
  resetPhoto();
  $("manualEnergy").hidden = $("photoPanel").hidden = slot < 0;
  $("deviceForm").reset();
  $("deviceUnit").onchange();
  const review = slot < 0;
  $("comparison").hidden = !review;
  $("region").hidden = slot !== 0 && Boolean(selectedDistributor);
  $("manualEnergy").open = false;
  $("compareGuide").hidden = false;
  $("title").textContent = review ? "3 de 3 · Comparar aparelhos" : slot === 0 ? "1 de 3 · Primeiro aparelho" : "2 de 3 · Segundo aparelho";
  $("compareGuide").textContent = review
    ? "Informe os preços se quiser saber em quanto tempo a diferença se paga. Depois, escolha o período e toque em Ver comparação."
    : (slot === 1 ? "Primeiro aparelho: " + devices[0].nome + ". " : "Escolha a distribuidora. ") + "Digite os dados do aparelho ou fotografe a etiqueta.";
  $("calculateDevice").textContent = "Usar estes dados e continuar";
  $("analyzePhoto").textContent = "Analisar foto e continuar";
  for (let i = 0; i < 2; i++) {
    const device = devices[i];
    $("compName"+i).textContent = device?.nome ?? "Aguardando dados";
    $("compEdit"+i).hidden = !device || slot === i;
    $("compCapacity"+i).parentElement.hidden = !device;
    $("compHours"+i).parentElement.hidden = !device || usesMonthly(device);
  }
  updateAnalyzeButton();
  $("title").focus();
  window.scrollTo(0,0);
}
function usesMonthly(device) {
  return device.mensal != null && (device.horas_referencia != null || device.continuo || !device.watts);
}
function startComparison(first, hours) {
  if (!$("resultScreen").hidden) {
    showAnalysisResult(false);
    history.replaceState(null,"",location.pathname + location.search);
  }
  openMode("energia");
  comparing = true;
  devices = [first,null];
  $("comparison").hidden = false;
  $("compareYears").value = "1";
  $("compareCards").replaceChildren();
  for (let i = 0; i < 2; i++) {
    const card = el("fieldset","");
    card.append(el("legend","Aparelho " + (i === 0 ? "A" : "B")));
    const name = el("strong","");
    name.id = "compName"+i;
    card.append(name);
    for (const [prefix,labelText] of [["compPrice","Preço de compra (R$, opcional)"],["compHours","Horas de uso por dia"]]) {
      const label = el("label",labelText);
      const input = document.createElement("input");
      input.id = prefix+i;
      input.inputMode = "decimal";
      if (prefix === "compHours" && first && i === 0) input.value = hours;
      label.append(input);
      card.append(label);
    }
    const capacityLabel = el("label","Capacidade (opcional, ex.: 350 L ou 9.000 BTU/h)");
    const capacity = document.createElement("input");
    capacity.id = "compCapacity"+i;
    capacity.maxLength = 100;
    capacity.value = devices[i]?.capacidade ?? "";
    capacityLabel.append(capacity);
    card.append(capacityLabel);
    const edit = button("Substituir aparelho",() => configureSlot(i));
    edit.id = "compEdit"+i;
    card.append(edit);
    $("compareCards").append(card);
  }
  configureSlot(first ? 1 : 0);
}
$("compareStart").onclick = () => startComparison(null,null);
$("compareOther").onclick = () => startComparison(item,$("hours").value);
function comparisonNumber(id, optional, max) {
  const field = $(id), value = field.value.trim();
  if (optional && !value) return null;
  const number = /^\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(",",".")) : NaN;
  if (!Number.isFinite(number) || number > max || (!optional && number <= 0)) {
    field.focus();
    throw Error(optional ? "Confira o preço de compra informado." : "Informe as horas de uso por dia, acima de zero e até 24.");
  }
  return number;
}
$("compareRun").onclick = async () => {
  if (!comparing || request || !selectedDistributor || !devices.every(Boolean) || !validateManualRate()) return;
  const version = revision;
  const controller = new AbortController();
  request = controller;
  $("region").disabled = true;
  updateAnalyzeButton();
  try {
    const months = 12 * Number($("compareYears").value);
    const rows = devices.map((d,i) => {
      const price = comparisonNumber("compPrice"+i,true,1e12);
      const monthly = usesMonthly(d);
      const hours = monthly ? null : comparisonNumber("compHours"+i,false,24);
      const kwh = monthly ? d.mensal : d.watts * hours * 30 / 1000;
      return {name:d.nome,price,kwh,capacity:$("compCapacity"+i).value.trim() || "Não informada",basis:monthly ? "Consumo mensal informado" : br(d.watts)+" W × "+br(hours)+" h/dia × 30 dias",
        condition:(monthly ? d.temperatura_consumo_mensal : d.temperatura_potencia) || "Não informada"};
    });
    const manual = manualRate();
    const tariff = manual === null ? await getJSON("/api/energia/tarifa/"+selectedDistributor.cnpj,{signal:controller.signal,cache:"no-store"}) : {valor_kwh:manual,distribuidora:selectedDistributor.label};
    if (version !== revision) return;
    const rate = tariff.valor_kwh;
    const table = document.createElement("table");
    function row(title,values,header=false) {
      const tr = document.createElement("tr");
      tr.append(el("th",title),...values.map(v => el(header ? "th" : "td",v)));
      table.append(tr);
    }
    row("Indicador",rows.map((r,i)=>(i===0?"A · ":"B · ")+r.name),true);
    row("Capacidade",rows.map(r=>r.capacity));
    row("Preço",rows.map(r=>r.price === null ? "Não informado" : money(r.price)));
    row("Base de cálculo",rows.map(r=>r.basis));
    row("Condição térmica",rows.map(r=>r.condition));
    row("Consumo mensal",rows.map(r=>br(r.kwh,3)+" kWh"));
    row("Energia por mês",rows.map(r=>money(r.kwh*rate)));
    row("Compra + energia em "+months+" meses",rows.map(r=>r.price === null ? "—" : money(r.price+r.kwh*rate*months)));
    const efficient = rows[0].kwh <= rows[1].kwh ? 0 : 1;
    const best = rows[efficient], other = rows[1-efficient];
    const label = efficient === 0 ? "A" : "B";
    const savings = (other.kwh-best.kwh)*rate;
    let conclusion = "Os dois têm o mesmo gasto mensal de energia. A energia não compensa uma diferença no preço de compra.";
    if (savings > 0) {
      conclusion = "O aparelho "+label+" economiza "+money(savings)+" por mês.";
      if (best.price !== null && other.price !== null) {
        const extra = best.price-other.price;
        conclusion += extra > 0 ? " O preço adicional de "+money(extra)+" se paga em cerca de "+Math.ceil(extra/savings)+" meses." : " Ele também tem preço de compra igual ou menor.";
      } else conclusion += " Informe os dois preços para calcular o retorno.";
    }
    if (rows.every(r => r.price !== null)) {
      const totals = rows.map(r => r.price + r.kwh * rate * months);
      const difference = Math.round(Math.abs(totals[0]-totals[1])*100)/100;
      conclusion += difference ? " Em "+months+" meses, o aparelho "+(totals[0]<totals[1]?"A":"B")+" custa "+money(difference)+" a menos no total." : " Os custos totais se igualam no período escolhido.";
    }
    item = {nome:"Comparação de aparelhos"};
    $("result").replaceChildren(el("h2",item.nome),el("p",conclusion),table,el("p",tariff.distribuidora+" · "+rateText(rate)+(manual === null ? " · ANEEL" : " · Fatura")),el("p",(usesMonthly(devices[0]) !== usesMonthly(devices[1]) ? "As bases diferem: um consumo é mensal e o outro foi estimado pela potência. " : "")+"Estimativa com tarifa e uso constantes. Compare aparelhos de capacidade e condições de uso semelhantes."));
    history.pushState({analysisResult:version},"","#resultado");
    showAnalysisResult(true);
  } catch(error) {
    if (version === revision) say(error.message || "Não foi possível comparar os aparelhos.");
  } finally {
    if (version === revision) { request=null; $("region").disabled=false; updateAnalyzeButton(); }
  }
};
function energyTemperature(monthly) {
  if (item.manual) return "Cálculo com dados informados manualmente, sem ajuste de temperatura.";
  const condition = monthly ? item.temperatura_consumo_mensal : item.temperatura_potencia;
  if (condition) return "Condição indicada na etiqueta: " + condition;
  const name = normalizeDistributorName(item.nome);
  if (/ar condicionado|split|climatizador/.test(name)) {
    return "A etiqueta não indica a temperatura de referência deste cálculo. A estimativa não pressupõe um ajuste específico no controle do ar-condicionado.";
  }
  if (/geladeira|refrigerador|freezer|frigobar/.test(name)) {
    return "A etiqueta não informa a temperatura interna ou a posição do termostato usada nesta medição. A estimativa não pressupõe que o seletor esteja no médio.";
  }
  if (/forno|aquecedor|secadora|lava loucas|lavadora/.test(name)) {
    return "A etiqueta não associa o valor utilizado a uma temperatura ou programa específico. O ajuste escolhido durante o uso pode alterar o consumo.";
  }
  return "Esta estimativa usa o dado elétrico da etiqueta, sem assumir uma temperatura de funcionamento.";
}
function drawEnergy() {
  const hours = Number($("hours").value);
  const monthly = usesMonthly(item);
  const base = item.horas_referencia ?? 24;
  const kw = monthly ? item.mensal/(30*base) : item.watts/1000;
  const kwh = kw * [1/60,1,hours,hours*30,hours*365][period];
  const basis = monthly ? "Consumo mensal distribuído por " + br(base) + " h/dia" + (item.horas_referencia ? (item.manual ? " conforme informado." : " conforme a etiqueta.") : " como hipótese de referência.") : "Estimativa pela potência nominal durante o uso.";
  $("hoursLabel").textContent = br(hours) + " h";
  $("basis").textContent = basis;
  Array.from($("periods").children).forEach((node,i) => node.setAttribute("aria-pressed",String(i === period)));
  const rate = appliedTariff.valor_kwh;
  const details = [appliedTariff.distribuidora, rateText(rate), br(hours) + " h/dia"].filter(Boolean);
  const source = appliedTariff.fim
    ? officialNote + " Vigência de " + dateBR(appliedTariff.inicio) + " a " + dateBR(appliedTariff.fim) + "." + baseNote(appliedTariff)
    : "Valor informado da fatura.";
  $("result").replaceChildren(
    el("h2",item.nome),
    el("p","Estimativa · " + periods[period] + (period < 2 ? " de uso" : period === 4 ? " (365 dias)" : "")),
    el("p",money(kwh * rate),"metric"),
    el("p",br(kwh,6) + " kWh"),
    el("p",[item.watts && br(item.watts) + " W",item.mensal && br(item.mensal) + " kWh/mês",item.classe && "Classe " + item.classe].filter(Boolean).join(" · ")),
    el("p",details.join(" · ")),
    el("p",source),
    el("p",basis),
    el("h3","Temperatura de referência"), el("p",energyTemperature(monthly)),
  );
}
function macros(data) {
  const list = el("ul","");
  for (const [key,label] of Object.entries(nutrients)) list.append(el("li",label+": "+br(data[key])+(key === "kcal" ? " kcal" : " g")));
  return list;
}
$("foodAmount").oninput = drawFood;
function foodMeasure(food) {
  const readUnit = regex => {
    const match = food.porcao.match(regex);
    return match ? Number(match[1].replace(",",".")) : null;
  };
  const grams = food.base_gramas ?? readUnit(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  const ml = food.base_ml ?? readUnit(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (food.tipo_alimento !== "liquido" && grams > 0) return {unit:"g",base:grams};
  if (food.tipo_alimento !== "solido") {
    if (ml > 0) return {unit:"ml",base:ml};
    if (food.tipo_alimento === "liquido" && food.xicaras_por_porcao > 0) {
      return {unit:"ml",base:food.xicaras_por_porcao * (food.capacidade_xicara_ml ?? 200)};
    }
  }
  return {unit:"porção",base:1};
}
function servingAdvice(food, measure) {
  if (measure.unit === "ml" || !/x[ií]caras?/i.test(food.quantidade)) return food.quantidade;
  if (measure.unit === "g") {
    return "Para se orientar, a base nutricional da embalagem equivale a cerca de " +
      br(Math.max(1, Math.round(measure.base)),0) + " g. Ajuste a quantidade conforme sua fome e o restante da refeição.";
  }
  return "Ajuste a porção conforme sua fome e os acompanhamentos. O peso em gramas não foi identificado no rótulo.";
}
function drawFood() {
  const selected = Number($("foodAmount").value);
  const measure = foodMeasure(item);
  let factor = selected;
  let amount = br(selected) + (selected === 1 ? " porção" : " porções");
  let description = measure.unit === "porção" && /x[ií]caras?/i.test(item.porcao) ? amount : amount + " · Base do rótulo: " + item.porcao;
  if (measure.unit === "g") {
    factor = selected / measure.base;
    amount = br(selected,0) + " g";
    description = amount;
  } else if (measure.unit === "ml") {
    const volume = selected * 200;
    factor = volume / measure.base;
    amount = br(selected) + (selected < 2 ? " xícara" : " xícaras") + " de 200 ml";
    description = amount + " (" + br(volume,0) + " ml)";
  }
  const explanation = "Quantidade selecionada: " + description;
  $("foodAmountLabel").textContent = amount;
  $("foodAmount").setAttribute("aria-valuetext", amount);
  $("foodBase").textContent = explanation;
  const scaled = {};
  for (const key of Object.keys(nutrients)) scaled[key] = item[key] * factor;
  const level = scaled.kcal < 100 ? "Baixo" : scaled.kcal < 250 ? "Moderado" : "Alto";
  const alerts = [];
  const result = $("result");
  const values = macros(scaled);
  for (const [key, label, unit] of [
    ["fibras","Fibras","g"], ["sodio","Sódio","mg"],
    ["acucares_adicionados","Açúcares adicionados","g"], ["gorduras_saturadas","Gorduras saturadas","g"],
  ]) {
    if (Number.isFinite(item[key])) values.append(el("li",label + ": " + br(item[key] * factor) + " " + unit));
  }
  for (const [key, name, daily] of [
    ["sodio","sódio",2000], ["acucares_adicionados","açúcares adicionados",50],
    ["gorduras_saturadas","gorduras saturadas",20],
  ]) {
    if (!Number.isFinite(item[key])) continue;
    const percent = 100 * item[key] * factor / daily;
    if (percent >= 50) alerts.push(el("p","Atenção: essa quantidade fornece " + br(percent,1) +
      "% do valor diário de referência de " + name + " para rotulagem. Considere reduzir a porção ou ajustar o restante do dia."));
  }
  result.replaceChildren(
    el("h2",item.nome), el("p",description), values,
    el("h3","Nível calórico · " + level),
    el("p","Escala ilustrativa por porção: baixo abaixo de 100 kcal, moderado de 100 a menos de 250 e alto a partir de 250."),
    ...alerts,
    el("h3","Quanto consumir"), el("p",servingAdvice(item,measure)),
    el("h3","Quando consumir"), el("p",item.horario),
    el("h3","Combina com"), el("p",item.combinacoes.join(" · ")),
  );
}
function drawMeal() {
  $("mealBox").hidden = mode !== "nutricao" || !meal.length;
  if (!meal.length) return;
  const totals = Object.fromEntries(Object.keys(nutrients).map(k => [k,meal.reduce((sum,f) => sum+f[k],0)]));
  const list = el("ol","");
  const edit = $("editMeal");
  edit.replaceChildren(el("h3","Editar refeição"));
  meal.forEach((f,i) => {
    list.append(el("li",f.nome+" · "+f.porcao));
    edit.append(button("Remover "+f.nome+" ("+(i+1)+")", () => {
      if (saveMeal(meal.filter((_,j) => i !== j))) say("Alimento removido.");
    }));
  });
  edit.append(button("Limpar tabela", () => { $("clearDialog").returnValue = ""; $("clearDialog").showModal(); }));
  $("meal").replaceChildren(el("h2","Minha tabela nutricional da refeição"),list,el("h3","Total da refeição"),macros(totals));
}
$("clearDialog").onclose = () => { if ($("clearDialog").returnValue === "clear" && saveMeal([])) say("Refeição limpa."); };
window.addEventListener("storage", e => { if (e.key === mealKey || e.key === null) { meal = loadMeal(); drawMeal(); } });
function loadCanvas() {
  if (!library) library = new Promise((resolve,reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => { library = null; reject(Error("Conecte-se à internet para gerar a imagem.")); };
    document.head.append(script);
  });
  return library;
}
function shareText(text) { location.assign("https://wa.me/?text="+encodeURIComponent(text)); }
async function exportCard(id, share) {
  const card = $(id), text = card.innerText;
  if (share && (!navigator.canShare || !navigator.share)) { shareText(text); return; }
  try {
    const render = await loadCanvas();
    const canvas = await render(card,{scale:2,backgroundColor:"#ffffff",logging:false});
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/png"));
    if (!blob) throw Error("Falha ao criar a imagem.");
    const file = new File([blob], id === "meal" ? "minha-refeicao.png" : "resumo-rotulo.png",{type:"image/png"});
    if (share) {
      if (!navigator.canShare({files:[file]})) { shareText(text); return; }
      const send = async () => { try { await navigator.share({files:[file]}); } catch(e) { if (e.name !== "AbortError") shareText(text); } };
      if (navigator.userActivation?.isActive) await send();
      else {
        const dialog = document.createElement("dialog");
        dialog.setAttribute("aria-label","Compartilhar imagem");
        dialog.append(el("p","Imagem pronta. Escolha o aplicativo para enviar."),button("Escolher aplicativo",() => {dialog.close();send();}),button("Cancelar",() => dialog.close()));
        document.body.append(dialog);
        dialog.onclose = () => dialog.remove();
        dialog.showModal();
      }
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = file.name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),30000);
    }
  } catch(e) { if (share) shareText(text); else say(e.message || "Não foi possível baixar o resumo."); }
}
for (const [id,actions] of [["result","resultActions"],["meal","mealActions"]]) {
  $(actions).append(button("📥 Baixar Resumo (Imagem)",() => exportCard(id,false)),button("📲 Enviar no WhatsApp",() => exportCard(id,true)));
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => say("A instalação offline está indisponível neste navegador."));

