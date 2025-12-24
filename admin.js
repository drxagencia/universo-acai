import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// =======================================================
// CONFIGURAÇÃO DO FIREBASE
// =======================================================
const firebaseConfig = {
  apiKey: "AIzaSyCnTKk4-WSvSpoy0onqWBTDLqDfY9oaEdE",
  authDomain: "drxagencia-6ce0a.firebaseapp.com",
  databaseURL: "https://drxagencia-6ce0a-default-rtdb.firebaseio.com",
  projectId: "drxagencia-6ce0a",
  storageBucket: "drxagencia-6ce0a.firebasestorage.app",
  messagingSenderId: "251757919420",
  appId: "1:251757919420:web:26a49c29d0bab8cafca4b9",
  measurementId: "G-V3L12DWZL5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Variável global para guardar o ID da empresa detectada
let currentCompanyId = null;

// --- 1. SEGURANÇA E LOGIN INTELIGENTE ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // O usuário está logado, mas ainda não sabemos qual é a empresa dele.
        // Vamos buscar no banco qual empresa tem esse email como 'email_dono'.
        
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, "empresas"));
            
            if (snapshot.exists()) {
                const todasEmpresas = snapshot.val();
                let empresaEncontrada = null;

                // Loop para encontrar o dono
                for (const [id, dados] of Object.entries(todasEmpresas)) {
                    if (dados.config && dados.config.email_dono === user.email) {
                        empresaEncontrada = id;
                        break;
                    }
                }

                if (empresaEncontrada) {
                    currentCompanyId = empresaEncontrada;
                    iniciarDashboard(user.email);
                } else {
                    alert("ERRO CRÍTICO: Seu usuário existe, mas nenhuma loja está vinculada a este e-mail no banco de dados.");
                    signOut(auth);
                }
            } else {
                alert("Erro: Banco de dados vazio ou sem permissão de leitura.");
                signOut(auth);
            }

        } catch (error) {
            console.error("Erro ao buscar empresa:", error);
            alert("Erro de conexão ou permissão.");
            signOut(auth);
        }
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('dashboard-screen').style.display = 'none';
    }
});

function iniciarDashboard(email) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    
    // Formata o ID para ficar bonito no topo (ex: universo_acai -> UNIVERSO ACAI)
    const nomeFormatado = currentCompanyId.replace(/_/g, ' ').toUpperCase();
    document.querySelector('.brand').innerHTML = `<i class="fas fa-terminal"></i> ${nomeFormatado} <span style="color: var(--neon-blue);">ADMIN</span>`;
    
    document.title = `Admin | ${nomeFormatado}`;
    
    initSystem();
}

// Função para ver/ocultar senha
const btnVerSenha = document.getElementById('btn-ver-senha');
if (btnVerSenha) {
    btnVerSenha.addEventListener('click', () => {
        const inputSenha = document.getElementById('login-senha');
        if (inputSenha.type === "password") {
            inputSenha.type = "text";
            btnVerSenha.classList.remove('fa-eye');
            btnVerSenha.classList.add('fa-eye-slash');
        } else {
            inputSenha.type = "password";
            btnVerSenha.classList.remove('fa-eye-slash');
            btnVerSenha.classList.add('fa-eye');
        }
    });
}

document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const textoOriginal = btn.innerText;
    btn.innerText = "Verificando...";
    btn.disabled = true;

    signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-senha').value)
        .catch(error => {
            alert("Erro de Login: " + error.message);
            btn.innerText = textoOriginal;
            btn.disabled = false;
        });
});

window.fazerLogout = () => {
    currentCompanyId = null;
    signOut(auth);
};

// --- 2. NAVEGAÇÃO ---
window.trocarAba = (aba) => {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`view-${aba}`).style.display = 'block';
    
    const btns = document.querySelectorAll('.nav-btn');
    if(aba === 'pedidos') btns[0].classList.add('active');
    if(aba === 'financeiro') btns[1].classList.add('active');
    if(aba === 'estoque') btns[2].classList.add('active');
};

// --- 3. SISTEMA ---
let pedidosCache = [];

function initSystem() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('filtro-data-pedidos').value = hoje;
    document.getElementById('filtro-data-financeiro').value = hoje;

    carregarPedidos();
    carregarEstoque();

    document.getElementById('filtro-data-pedidos').addEventListener('change', renderizarPedidos);
    document.getElementById('filtro-data-financeiro').addEventListener('change', calcularFinanceiro);
}

// --- 4. PEDIDOS ---
function carregarPedidos() {
    // Usa o ID descoberto automaticamente
    const pedidosRef = ref(db, `empresas/${currentCompanyId}/pedidos`);
    
    onValue(pedidosRef, (snapshot) => {
        pedidosCache = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => pedidosCache.push({ id: key, ...data[key] }));
        }
        pedidosCache.reverse(); 
        renderizarPedidos();
        calcularFinanceiro();
    });
}

function renderizarPedidos() {
    const filtro = document.getElementById('filtro-data-pedidos').value; 
    const [ano, mes, dia] = filtro.split('-');
    const buscaData = `${dia}/${mes}/${ano}`;

    const container = document.getElementById('lista-pedidos');
    container.innerHTML = '';

    const filtrados = pedidosCache.filter(p => p.data_hora && p.data_hora.includes(buscaData));

    if (filtrados.length === 0) {
        container.innerHTML = '<p style="color:#666; width:100%; text-align:center; padding:20px;">Sem pedidos nesta data.</p>';
        return;
    }

    filtrados.forEach(p => {
        let classeStatus = 'st-pendente';
        if (p.status === 'entregue' || p.status === 'em_transporte' || p.status === 'finalizado') classeStatus = 'st-entregue';
        if (p.status === 'cancelado') classeStatus = 'st-cancelado';

        let htmlItens = '';
        if (p.itens) {
            p.itens.forEach(item => {
                const sabores = item.sabores && item.sabores.length > 0 ? `<b>Sabores:</b> ${item.sabores.join(', ')}` : '';
                const recheios = item.recheios && item.recheios.length > 0 ? `<b>Recheios:</b> ${item.recheios.join(', ')}` : '';
                const adds = item.adicionais && item.adicionais.length > 0 ? `<b>Extras:</b> ${item.adicionais.map(a => a.nome).join(', ')}` : '';

                htmlItens += `
                    <div style="margin-bottom:12px; font-size:0.9rem; color:#eee; border-bottom: 1px solid #333; padding-bottom: 8px;">
                    <span style="color:var(--neon-blue)">●</span> 1x <b>${item.produto}</b> <br>
                    <div style="padding-left: 15px; margin-top: 4px; color: #bbb; font-size: 0.85rem; line-height: 1.4;">
                        ${sabores ? sabores + '<br>' : ''}
                        ${recheios ? recheios + '<br>' : ''}
                        ${adds}
                    </div>
                    </div>`;
            });
        }

        let botoesHtml = '';
        if (!p.status || p.status === 'pendente') {
            botoesHtml = `
                <button onclick="mudarStatus('${p.id}', 'cancelado')" class="btn-status btn-cancelar">RECUSAR</button>
                <button onclick="mudarStatus('${p.id}', 'preparo')" class="btn-status btn-preparo"><i class="fas fa-fire"></i> PREPARAR</button>
            `;
        } else if (p.status === 'preparo') {
            botoesHtml = `<button onclick="mudarStatus('${p.id}', 'entrega')" class="btn-status btn-entrega"><i class="fas fa-motorcycle"></i> ENTREGA</button>`;
        } else if (p.status === 'entrega') {
            botoesHtml = `<button onclick="mudarStatus('${p.id}', 'finalizado')" class="btn-status btn-finalizar"><i class="fas fa-check-double"></i> FINALIZAR</button>`;
        } else if (p.status === 'finalizado') {
            botoesHtml = `<span style="color:var(--neon-green); font-size:0.8rem;">PEDIDO CONCLUÍDO</span>`;
        } else if (p.status === 'cancelado') {
            botoesHtml = `<span style="color:var(--neon-red); font-size:0.8rem;">CANCELADO</span>`;
        }

        let enderecoFormatado = 'Retirada/Sem endereço';
        if (p.endereco && typeof p.endereco === 'object') {
            enderecoFormatado = `${p.endereco.rua || ''}, ${p.endereco.bairro || ''} (${p.endereco.ref || ''})`;
        } else if (typeof p.endereco === 'string') {
            enderecoFormatado = p.endereco;
        }

        const idVisual = p.display_id ? p.display_id : `#${p.id.slice(-4)}`;

        const card = document.createElement('div');
        card.className = 'card-pedido';
        card.innerHTML = `
            <div class="card-header">
                <span style="color:#fff; font-size:1.2rem;">${idVisual}</span>
                <span class="status ${classeStatus}">${p.status ? p.status.toUpperCase() : 'PENDENTE'}</span>
            </div>
            <div style="margin-bottom:10px; color: var(--neon-blue);">
                <i class="fas fa-user"></i> ${p.cliente?.nome || 'Cliente'} <br>
                <i class="fab fa-whatsapp"></i> ${p.cliente?.whatsapp || ''} <br>
                <small style="color:#888;">${enderecoFormatado}</small>
                <div style="margin-top:5px; color:#aaa; font-size:0.85rem;"><i class="far fa-credit-card"></i> ${p.pagamento?.metodo || '?'} ${p.pagamento?.troco ? '(Troco: '+p.pagamento.troco+')' : ''}</div>
            </div>
            <div style="background:#111; padding:10px; border-radius:5px; margin-bottom:10px;">${htmlItens}</div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="color:#aaa">Total:</span>
                <strong style="font-size:1.4rem;">R$ ${p.total_pedido || 0}</strong>
            </div>

            <div class="actions-container">${botoesHtml}</div>
        `;
        container.appendChild(card);
    });
}

window.mudarStatus = (id, st) => {
    update(ref(db, `empresas/${currentCompanyId}/pedidos/${id}`), { status: st });
};

// --- 5. FINANCEIRO ---
function calcularFinanceiro() {
    const dataInput = document.getElementById('filtro-data-financeiro').value;
    const [ano, mes, dia] = dataInput.split('-');
    const strDia = `${dia}/${mes}/${ano}`;
    const strMes = `${mes}/${ano}`;

    let fatDia = 0, fatMes = 0;

    pedidosCache.forEach(p => {
        if(p.status !== 'finalizado') return;
        let val = parseFloat(p.total_pedido) || 0;
        if (p.data_hora && p.data_hora.includes(strDia)) fatDia += val;
        if (p.data_hora && p.data_hora.includes(`/${strMes}`)) fatMes += val;
    });

    const margem = 0.40; 
    document.getElementById('fat-dia').innerText = `R$ ${fatDia.toFixed(2)}`;
    document.getElementById('lucro-dia').innerText = `R$ ${(fatDia * margem).toFixed(2)}`;
    document.getElementById('fat-mes').innerText = `R$ ${fatMes.toFixed(2)}`;
    document.getElementById('lucro-mes').innerText = `R$ ${(fatMes * margem).toFixed(2)}`;
}

// --- 6. ESTOQUE ---
function carregarEstoque() {
    const base = `empresas/${currentCompanyId}/cardapio`;
    renderToggleGroup(`${base}/sabores`, 'estoque-sabores');
    renderToggleGroup(`${base}/recheios`, 'estoque-recheios');
    renderToggleGroup(`${base}/adicionais`, 'estoque-adicionais');
}

function renderToggleGroup(path, divId) {
    onValue(ref(db, path), snapshot => {
        const div = document.getElementById(divId);
        div.innerHTML = '';
        const dados = snapshot.val();
        
        if(dados) {
            const lista = Array.isArray(dados) ? dados : Object.keys(dados).map(k => ({ key: k, ...dados[k] }));
            
            lista.forEach((item, index) => {
                const key = item.key || index; 
                const isAtivo = item.disponivel !== false;

                const row = document.createElement('div');
                row.className = `item-row ${!isAtivo ? 'disabled' : ''}`;
                row.innerHTML = `
                    <span>${item.nome}</span>
                    <label class="switch">
                        <input type="checkbox" ${isAtivo ? 'checked' : ''} 
                            onchange="toggleItem('${path}/${key}', this.checked)">
                        <span class="slider"></span>
                    </label>
                `;
                div.appendChild(row);
            });
        }
    });
}

window.toggleItem = (fullPath, estado) => {
    update(ref(db, fullPath), { disponivel: estado });
};
