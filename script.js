// Constantes de Configuração
const GROQ_API_KEY = "sua-chave-aqui"; // Mantenha sua chave da Groq aqui
const SUPABASE_URL = "sua-chave-aqui";
const SUPABASE_ANON_KEY = "sua-chave-aqui"; // Cole aqui a sua chave 'anon public' correta do Supabase

// Inicializar cliente do Supabase (certifique-se de carregar o script do supabase-js no HTML)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Carregar o histórico assim que a página abrir (R6)
window.onload = function() {
    carregarHistorico();
};

// Função principal chamada pelo botão (R1, R2, R3, R4, R5, R8)
async function enviarPergunta() {
    const input = document.getElementById("perguntaInput");
    const textoPergunta = input.value.trim();
    const botao = document.getElementById("perguntaBtn");
    const respostaContainer = document.getElementById("respostaContainer");

    // R1: Validar campo vazio
    if (textoPergunta === "") {
        alert("Escreva uma dúvida primeiro.");
        return;
    }

    // R3: Desativar botão e mostrar "Pensando..."
    botao.disabled = true;
    respostaContainer.textContent = "Pensando...";
    
    let respostaIA = "";
    
    try {
        respostaIA = await chamarGroq(textoPergunta);

        if (!respostaIA || respostaIA.trim() === "") {
            throw new Error("IA devolveu resposta vazia.");
        }

        // Mostrar a resposta na tela mantendo as quebras de linha (R4)
        respostaContainer.textContent = respostaIA;

        // R5: Salvar no Supabase somente se a IA respondeu com sucesso
        await salvarNoSupabase(textoPergunta, respostaIA);

        // Atualizar o histórico na tela (R6)
        carregarHistorico();
        
        // Limpar o campo de texto
        input.value = "";

    } catch (error) {
        // R8: Tratamento de erros específicos
        console.error(error);
        
        if (error.message.includes("401")) {
            respostaContainer.textContent = "Erro 401: Chave da Groq inválida ou vazia.";
        } else if (error.message.includes("429")) {
            respostaContainer.textContent = "Muitos pedidos seguidos. Espere um pouco e tente de novo.";
        } else if (error.message.includes("Supabase")) {
            respostaContainer.textContent = respostaIA + " (Aviso: A resposta apareceu, mas NÃO foi salva no banco).";
        } else {
            respostaContainer.textContent = "A IA falhou ao responder. Verifique sua conexão.";
        }
    } finally {
        // R3 & R8: O botão SEMPRE volta ao normal
        botao.disabled = false;
    }
}

// Função para falar com a Groq (Parte 4)
async function chamarGroq(pergunta) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: "openai/gpt-oss-20b", // Modelo leve e universal compatível com todas as contas da Groq
            messages: [
                {
                    role: "system",
                    content: "Você é um assistente de estudos. Responda em português, de forma simples e em até 5 linhas."
                },
                {
                    role: "user",
                    content: pergunta
                }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Detalhes do erro da Groq:", errorData);
        throw new Error(`Erro HTTP: ${response.status} - ${errorData.error?.message || 'Falha na API'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Função para salvar no Supabase (R5)
async function salvarNoSupabase(pergunta, resposta) {
    const { error } = await supabaseClient
        .from('perguntas')
        .insert([{ pergunta: pergunta, resposta: resposta }]);

    if (error) {
        console.error("Erro Supabase:", error);
        throw new Error("Supabase erro ao gravar");
    }
}

// Função para carregar o histórico do Supabase (R6)
async function carregarHistorico() {
    const historicoContainer = document.getElementById("historicoContainer");
    historicoContainer.innerHTML = "";

    const { data, error } = await supabaseClient
        .from('perguntas')
        .select('*')
        .order('created_at', { ascending: false }); // Do mais novo para o mais antigo

    if (error) {
        historicoContainer.textContent = "Erro ao carregar o histórico.";
        return;
    }

    if (data) {
        data.forEach(item => {
            const div = document.createElement("div");
            div.className = "historico-item";

            const pPergunta = document.createElement("p");
            pPergunta.innerHTML = `<strong>Pergunta:</strong> `;
            pPergunta.appendChild(document.createTextNode(item.pergunta)); // Segurança contra XSS (R9)

            const pResposta = document.createElement("p");
            pResposta.innerHTML = `<strong>Resposta:</strong> `;
            pResposta.appendChild(document.createTextNode(item.resposta)); // Segurança (R9)

            // R7: Botão Apagar
            const btnApagar = document.createElement("button");
            btnApagar.textContent = "Apagar";
            btnApagar.onclick = () => apagarItem(item.id, div);

            div.appendChild(pPergunta);
            div.appendChild(pResposta);
            div.appendChild(btnApagar);
            historicoContainer.appendChild(div);
        });
    }
}

// Função para apagar um item do histórico (R7)
async function apagarItem(id, elementoDiv) {
    const { error } = await supabaseClient
        .from('perguntas')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Não foi possível apagar o registro.");
        return;
    }

    // Remove da tela se deu certo no banco
    elementoDiv.remove();
}