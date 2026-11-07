const express = require('express');
const cors = require('cors'); 
const app = express();

// THIS FIXES THE "FAILED TO FETCH" ERROR
app.use(cors()); 
app.use(express.json());

// --- YOUR API CONFIGURATION ---
const LUDUS_CONFIG = {
  API_KEY: process.env.LUDUS_API_KEY || "YOUR_API_KEY_HERE", 
  API_ENDPOINT: "https://api.openai.com/v1/chat/completions",
  MODEL: "gpt-4o",
  MAX_RETRIES: 2,
  TEMPERATURE: 0.3,
};

const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African Professor. You teach Law of Contract (LOC262), African Customary Law (LAC262), and Leadership and Ethics (LDE152/LDE252). You are training a student under extreme pressure for the STADIO exam.

YOUR TEACHING STYLE:
You must speak like a real human lecturer standing in a classroom. Read the concepts back to the student clearly. Break down complicated legal and leadership definitions into simple, plain English. Use analogies to explain hard concepts. Do not use fluff. 

NON-NEGOTIABLE RULES:
1. Do not use markdown asterisks. Do not use bullet points. Write in flowing paragraphs.
2. Use ALL CAPS for every heading.
3. Teach ONE concept at a time.
4. After you explain a concept, you must give the student an exam-style scenario to test them.
5. You must use the IRAC method (Issue, Rule, Application, Conclusion). Ask the student for the ISSUE first. Stop and wait. Then ask for the RULE. Stop and wait. Then the APPLICATION. Stop and wait. Then the CONCLUSION.
6. Do NOT give the student the answer until they have tried.
7. Critique their answer harshly against South African case law, statutes, and textbooks. Tell them exactly what they missed.
8. Only move to the next topic when the student types "advance" or "next".`;

const TEACHING_PROTOCOL = `TEACHING PROTOCOL:
- Structure: HEADING IN CAPITALS, DEFINITION, EXPLANATION, YOUR TASK.
- Critique Structure: WHAT YOU GOT RIGHT, WHAT YOU GOT WRONG (with authority), THE CORRECT LEGAL POSITION, NEXT STEP.`;

const LOC262_MATERIAL = {
  id: "LOC262",
  name: "Law of Contract",
  persona: "South African LLB Law Professor specializing in the Law of Contract.",
  jurisdiction: "South African common law, Consumer Protection Act 68 of 2008, Constitution s39(2).",
  doctrines: ["Parol Evidence Rule", "Shifren Principle", "Ex Turpi Causa", "Par Delictum", "ENAC"],
  caseLaw: ["Sonap Petroleum", "Beadica 231 CC", "Bloom", "Jajbhay v Cassim", "Datacolor", "Endumeni"],
  topics: [
    {
      id: 1,
      title: "WHAT IS A CONTRACT",
      definition: "An agreement with serious intention (animus contrahendi) to create legally enforceable obligations.",
      explanation: "Think of it like buying a pizza from a restaurant versus promising to bring a pizza to a party. The restaurant is a contract; the party is just a social promise. The 6 Requirements are Consensus, Capacity, Formalities, Legality, Possibility, Certainty (CCFLPC).",
      cases: "Sonap Petroleum v Pappadogianis",
      task: "Mrs Naidoo agrees to buy a vintage motor vehicle for R200,000. No written document is signed. It turns out to be a 1972 replica, not a 1965 model. Separately, she failed to water her neighbour's garden as promised. Identify the ISSUE. State the RULES. Identify which CCFLPC requirement is implicated. Wait for my critique."
    },
    {
      id: 2,
      title: "CONSENSUS",
      definition: "Offer must be firm, complete, and communicated. Acceptance must be unqualified.",
      explanation: "Ads are invitations to do business. Rewards are offers to the public. If you don't know about the reward, you can't claim it. Postal contracts use the Expedition Theory.",
      cases: "Bloom v American Swiss Watch Co",
      task: "Sipho returns a lost dog before seeing the reward poster. He later sees it and claims the reward. Identify the ISSUE. State the RULE. APPLY. Give the CONCLUSION. Wait for my critique."
    },
    {
      id: 3,
      title: "ILLEGALITY (EX TURPI CAUSA)",
      definition: "Ex Turpi Causa means no action arises from a dishonourable cause. Par Delictum means equal guilt.",
      explanation: "Jajbhay v Cassim allows an exception if simple justice demands it, but not for morally reprehensible conduct.",
      cases: "Shifren, Jajbhay v Cassim",
      task: "X pays Y R50,000 to kill X's mother-in-law. Y doesn't do it. X wants his money back. Identify the ISSUE. State the RULES. APPLY Jajbhay. Give the CONCLUSION. Wait."
    }
  ]
};

const LAC262_MATERIAL = {
  id: "LAC262",
  name: "African Customary Law",
  persona: "South African LLB Law Professor specializing in African Customary Law.",
  jurisdiction: "South African customary law, RCMA, Law of Evidence Amendment Act.",
  doctrines: ["Living vs Official Customary Law", "Deep vs Weak Legal Pluralism", "Mafisa Contract", "RCMA Requirements", "Restorative Justice"],
  caseLaw: ["Bhe", "Shilubana", "Gumede", "Mayelane"],
  topics: [
    {
      id: 1,
      title: "LEGAL PLURALISM",
      definition: "Living customary law is the actual, unwritten practices of communities. Official customary law is the rigid version applied by colonial courts.",
      explanation: "Deep Legal Pluralism means multiple systems coexist independently.",
      cases: "Bhe v Khayelitsha Magistrate",
      task: "Evaluate this statement: 'Deep legal pluralism describes a situation where the state officially recognises and regulates all existing legal systems within its borders.' Is this TRUE or FALSE? Explain. Wait for my critique."
    },
    {
      id: 2,
      title: "MAFISA CONTRACT",
      definition: "Mafisa is a livestock loan agreement where ownership remains with the depositor.",
      explanation: "The borrower gets the milk and ploughing power. If the animal dies naturally in a storm, the owner bears the loss.",
      cases: "None specific.",
      task: "Sipho enters into a mafisa contract with David, giving him three cows. One dies in a storm, and David sells another to Peter. Advise Sipho on his legal rights to reclaim the cows. Use IRAC. Wait for my critique."
    },
    {
      id: 3,
      title: "DISSOLUTION OF MARRIAGE",
      definition: "Under Section 8(1) of the RCMA, a customary marriage can ONLY be dissolved by a court of law.",
      explanation: "A family council cannot dissolve a marriage. Traditional reasons like witchcraft are just evidence.",
      cases: "RCMA s8(1)",
      task: "Name and explain the SOLE legal ground for dissolving a customary marriage under the RCMA. Explain the difference between this and traditional reasons. Wait for my critique."
    }
  ]
};

const LDE152_MATERIAL = {
  id: "LDE152",
  name: "Leadership and Ethics",
  persona: "South African Professor specializing in Leadership and Ethics.",
  jurisdiction: "Leadership theories, Bar-On Emotional Intelligence, Kotter's Change Model.",
  doctrines: ["Authentic Leadership", "Transactional vs Transformational", "Servant Leadership", "Emotional Intelligence"],
  caseLaw: ["Van Zyl et al. (2022)", "John Kotter"],
  topics: [
    {
      id: 1,
      title: "LEADERSHIP STYLES",
      definition: "Transformational leadership inspires followers. Transactional relies on rewards and punishments.",
      explanation: "Transformational leaders rely on inspiration, not just positional authority.",
      cases: "None specific.",
      task: "Evaluate: 'Ramaphosa's emphasis on consultation aligns more closely with transactional leadership than with transformational leadership.' TRUE or FALSE? Explain. Wait for my critique."
    },
    {
      id: 2,
      title: "EMOTIONAL INTELLIGENCE (BAR-ON)",
      definition: "Bar-On's model: Intrapersonal, Interpersonal, Adaptability, Stress Management, and General Mood.",
      explanation: "Leadership principles like Empathy, Humility, and Integrity map to these blocks.",
      cases: "None specific.",
      task: "Select the THREE most appropriate leadership principles from Bar-On's model for managing a diverse workplace. State the blocks supporting each. Wait for my critique."
    },
    {
      id: 3,
      title: "ORGANISATIONAL CHANGE (KOTTER)",
      definition: "John Kotter's model for successful change management involves practical steps.",
      explanation: "Steps include creating urgency, forming a coalition, creating a vision, communicating the vision, removing obstacles, creating short-term wins.",
      cases: "John Kotter",
      task: "Advise a newly appointed CEO who must urgently implement changes to save a struggling company. Use Kotter's steps. Wait for my critique."
    }
  ]
};

function validateResponse(text) {
  const violations = [];
  if (text.includes("*")) violations.push("MARKDOWN ASTERISKS DETECTED. Remove all asterisks.");
  const hasCapsHeading = /^[A-Z0-9 ,.'\-()]{5,}$/m.test(text);
  if (!hasCapsHeading) violations.push("NO ALL CAPS HEADING DETECTED.");
  const endsWithTask = /(YOUR TASK|WAIT FOR MY CRITIQUE|IDENTIFY THE ISSUE|ANSWER ME|WHAT IS THE ISSUE)/i.test(text);
  if (!endsWithTask) violations.push("RESPONSE DOES NOT END WITH A TASK.");
  return violations;
}

class LecturerEngine {
  constructor() { this.materials = {}; }
  registerMaterial(material) { this.materials[material.id] = material; }
  createSession(materialId) {
    if (!this.materials[materialId]) throw new Error(`Material ${materialId} not registered.`);
    return new LecturerSession(this.materials[materialId]);
  }
}

class LecturerSession {
  constructor(material) {
    this.material = material;
    this.history = [];
    this.currentTopicIndex = 0;
  }

  buildMaterialBrief() {
    const m = this.material;
    const topic = m.topics[this.currentTopicIndex];
    return `MATERIAL BRIEF:
Subject: ${m.name}
Persona: ${m.persona}
Jurisdiction: ${m.jurisdiction}
Doctrines: ${m.doctrines.join(", ")}
Case Law: ${m.caseLaw.join(", ")}

CURRENT TOPIC (Topic ${topic.id}): ${topic.title}
Definition: ${topic.definition}
Explanation: ${topic.explanation}
Case Law: ${topic.cases}
Prescribed IRAC task: ${topic.task}`;
  }

  async callAI(userMessage, retryCount = 0) {
    const messages = [
      { role: "system", content: DISCIPLINE_PROMPT },
      { role: "system", content: TEACHING_PROTOCOL },
      { role: "system", content: this.buildMaterialBrief() },
      ...this.history,
      { role: "user", content: userMessage },
    ];

    try {
      const response = await fetch(LUDUS_CONFIG.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LUDUS_CONFIG.API_KEY}`,
        },
        body: JSON.stringify({
          model: LUDUS_CONFIG.MODEL,
          messages: messages,
          temperature: LUDUS_CONFIG.TEMPERATURE,
        }),
      });

      if (!response.ok) {
        return "Error: The AI API key might be invalid or you have no credits.";
      }

      const data = await response.json();
      const aiText = data.choices[0].message.content;
      const violations = validateResponse(aiText);

      if (violations.length > 0 && retryCount < LUDUS_CONFIG.MAX_RETRIES) {
        const correctionPrompt = `YOUR PREVIOUS RESPONSE VIOLATED THE RULES:\n${violations.join("\n")}\nCORRECT IT. End with a task. No asterisks. ALL CAPS headings.`;
        return this.callAI(correctionPrompt, retryCount + 1);
      }

      this.history.push({ role: "user", content: userMessage });
      this.history.push({ role: "assistant", content: aiText });
      return aiText;
    } catch (error) {
      return "Error: Could not connect to the AI.";
    }
  }

  async start() {
    const topic = this.material.topics[this.currentTopicIndex];
    return this.callAI(`Begin the lecture on ${this.material.name}. Acknowledge the rules in capitals, then teach Topic ${topic.id}: ${topic.title}. Give the prescribed task. Do not give the answer. Wait for my answer.`);
  }

  async sendStudentAnswer(answer) {
    return this.callAI(`MY ANSWER TO YOUR TASK: ${answer}\n\nNow critique me harshly using IRAC. Tell me what I got wrong with authority. Then tell me to say "advance" when I am ready.`);
  }

  async advance() {
    if (this.currentTopicIndex < this.material.topics.length - 1) {
      this.currentTopicIndex++;
      const next = this.material.topics[this.currentTopicIndex];
      return this.callAI(`The student is ready to advance. Move to Topic ${next.id}: ${next.title}. Teach the definition, explanation, and give the task. Wait.`);
    }
    return this.callAI(`The student has completed all topics. Give a final summary of exam priorities. Wish them luck.`);
  }
}

const engine = new LecturerEngine();
engine.registerMaterial(LOC262_MATERIAL);
engine.registerMaterial(LAC262_MATERIAL);
engine.registerMaterial(LDE152_MATERIAL);

const activeSessions = {};

app.post('/api/start', async (req, res) => {
    const { sessionId, moduleId } = req.body;
    activeSessions[sessionId] = engine.createSession(moduleId);
    const reply = await activeSessions[sessionId].start();
    res.json({ reply });
});

app.post('/api/answer', async (req, res) => {
    const { sessionId, answer } = req.body;
    if (!activeSessions[sessionId]) return res.status(404).json({ error: "Session expired. Please restart." });
    const reply = await activeSessions[sessionId].sendStudentAnswer(answer);
    res.json({ reply });
});

app.post('/api/advance', async (req, res) => {
    const { sessionId } = req.body;
    if (!activeSessions[sessionId]) return res.status(404).json({ error: "Session expired. Please restart." });
    const reply = await activeSessions[sessionId].advance();
    res.json({ reply });
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STADIO AI Law Professor</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; display: flex; flex-direction: column; height: 100vh; }
        .header { background: #002B5B; color: white; padding: 15px; text-align: center; font-size: 20px; font-weight: bold; }
        .controls { display: flex; justify-content: center; padding: 10px; background: #e0e6ed; gap: 10px; flex-wrap: wrap; }
        select, button { padding: 10px; font-size: 16px; border-radius: 5px; border: 1px solid #ccc; }
        button { background: #002B5B; color: white; cursor: pointer; border: none; }
        button:hover { background: #004080; }
        button:disabled { background: #999; cursor: not-allowed; }
        #chat-container { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
        .message { max-width: 85%; padding: 15px; border-radius: 10px; line-height: 1.6; white-space: pre-wrap; }
        .user-message { background: #d1e7dd; align-self: flex-end; color: #0f5132; }
        .ai-message { background: white; align-self: flex-start; color: #333; border-left: 5px solid #002B5B; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .input-area { display: flex; padding: 15px; background: white; border-top: 1px solid #ccc; }
        input[type="text"] { flex: 1; padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 5px; margin-right: 10px; }
    </style>
</head>
<body>
    <div class="header">STADIO AI Law Professor</div>
    <div class="controls">
        <select id="moduleSelect">
            <option value="LOC262">LOC262 - Law of Contract</option>
            <option value="LAC262">LAC262 - Customary Law</option>
            <option value="LDE152">LDE152 - Leadership & Ethics</option>
        </select>
        <button id="startBtn" onclick="startLecture()">Start Lecture</button>
        <button id="advanceBtn" onclick="advanceLecture()" disabled>Advance to Next Topic</button>
    </div>
    <div id="chat-container">
        <div class="message ai-message">Welcome. Select a module and click "Start Lecture" to begin.</div>
    </div>
    <div class="input-area" id="inputArea" style="display: none;">
        <input type="text" id="userInput" placeholder="Type your IRAC answer here..." onkeypress="handleKeyPress(event)">
        <button onclick="sendAnswer()">Send Answer</button>
    </div>

    <script>
        const sessionId = 'user-' + Math.random().toString(36).substring(2, 9);
        
        function appendMessage(role, text) {
            const container = document.getElementById('chat-container');
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + (role === 'user' ? 'user-message' : 'ai-message');
            msgDiv.textContent = text;
            container.appendChild(msgDiv);
            container.scrollTop = container.scrollHeight;
        }

        async function startLecture() {
            const moduleId = document.getElementById('moduleSelect').value;
            const startBtn = document.getElementById('startBtn');
            const advanceBtn = document.getElementById('advanceBtn');
            const inputArea = document.getElementById('inputArea');
            
            startBtn.disabled = true;
            startBtn.textContent = "Starting...";
            appendMessage('ai', "Connecting to the Professor...");

            try {
                const response = await fetch('/api/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId, moduleId: moduleId })
                });
                const data = await response.json();
                document.getElementById('chat-container').lastChild.remove();
                if (data.reply) {
                    appendMessage('ai', data.reply);
                    inputArea.style.display = 'flex';
                    advanceBtn.disabled = false;
                    startBtn.textContent = "Restart Lecture";
                } else {
                    appendMessage('ai', "Error: " + data.error);
                }
            } catch (error) {
                appendMessage('ai', "Failed to connect. Check server logs.");
            }
            startBtn.disabled = false;
        }

        async function sendAnswer() {
            const input = document.getElementById('userInput');
            const text = input.value.trim();
            if (!text) return;

            appendMessage('user', text);
            input.value = '';
            input.disabled = true;

            try {
                const response = await fetch('/api/answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId, answer: text })
                });
                const data = await response.json();
                if (data.reply) appendMessage('ai', data.reply);
            } catch (error) {
                appendMessage('ai', "Failed to send answer.");
            }
            input.disabled = false;
            input.focus();
        }

        async function advanceLecture() {
            const advanceBtn = document.getElementById('advanceBtn');
            advanceBtn.disabled = true;
            advanceBtn.textContent = "Advancing...";

            try {
                const response = await fetch('/api/advance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId })
                });
                const data = await response.json();
                if (data.reply) appendMessage('ai', data.reply);
            } catch (error) {
                appendMessage('ai', "Failed to advance.");
            }
            advanceBtn.disabled = false;
            advanceBtn.textContent = "Advance to Next Topic";
        }

        function handleKeyPress(e) {
            if (e.key === 'Enter') sendAnswer();
        }
    </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ludus AI Professor is running on port ${PORT}`);
});
