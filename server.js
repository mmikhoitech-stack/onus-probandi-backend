const express = require('express');
const app = express();
app.use(express.json());

// --- YOUR API CONFIGURATION ---
const LUDUS_CONFIG = {
  API_KEY: process.env.LUDUS_API_KEY || "YOUR_API_KEY_HERE", // Render will look for LUDUS_API_KEY in Environment Variables
  API_ENDPOINT: process.env.LUDUS_ENDPOINT || "https://api.openai.com/v1/chat/completions",
  MODEL: process.env.LUDUS_MODEL || "gpt-4o",
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

// --- MATERIAL 1: LOC262 ---
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
  ],
  scenarios: {}
};

// --- MATERIAL 2: LAC262 ---
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
    }
  ],
  scenarios: {}
};

// --- MATERIAL 3: LDE152 ---
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
      definition: "Transformational leadership inspires followers to achieve extraordinary outcomes. Transactional leadership relies on structure, rewards, and punishments.",
      explanation: "Transformational leaders rely on inspiration, not just positional authority.",
      cases: "None specific.",
      task: "Compare the leadership approaches of Donald Trump and Cyril Ramaphosa. Evaluate this statement: 'Ramaphosa's emphasis on consultation aligns more closely with transactional leadership than with transformational leadership.' TRUE or FALSE? Explain. Wait for my critique."
    },
    {
      id: 2,
      title: "EMOTIONAL INTELLIGENCE (BAR-ON)",
      definition: "Bar-On's model consists of 5 blocks: Intrapersonal, Interpersonal, Adaptability, Stress Management, and General Mood.",
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
  ],
  scenarios: {}
};

// --- THE ENGINE LOGIC ---
function validateResponse(text, material) {
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

    const response = await fetch(LUDUS_CONFIG.API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LUDUS_CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        model: LUDUS_CONFIG.MODEL,
        messages,
        temperature: LUDUS_CONFIG.TEMPERATURE,
      }),
    });

    const data = await response.json();
    const aiText = data.choices[0].message.content;
    const violations = validateResponse(aiText, this.material);

    if (violations.length > 0 && retryCount < LUDUS_CONFIG.MAX_RETRIES) {
      const correctionPrompt = `YOUR PREVIOUS RESPONSE VIOLATED THE RULES:\n${violations.join("\n")}\nCORRECT IT. End with a task. No asterisks. ALL CAPS headings.`;
      return this.callAI(correctionPrompt, retryCount + 1);
    }

    this.history.push({ role: "user", content: userMessage });
    this.history.push({ role: "assistant", content: aiText });
    return aiText;
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

// --- SERVER BOOTSTRAP ---
const engine = new LecturerEngine();
engine.registerMaterial(LOC262_MATERIAL);
engine.registerMaterial(LAC262_MATERIAL);
engine.registerMaterial(LDE152_MATERIAL);

// Memory to hold sessions for different users
const activeSessions = {};

// 1. START LECTURE
app.post('/api/start', async (req, res) => {
    try {
        const { sessionId, moduleId } = req.body;
        activeSessions[sessionId] = engine.createSession(moduleId);
        const reply = await activeSessions[sessionId].start();
        res.json({ reply });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. SUBMIT ANSWER
app.post('/api/answer', async (req, res) => {
    try {
        const { sessionId, answer } = req.body;
        if (!activeSessions[sessionId]) return res.status(404).json({ error: "Session not found" });
        const reply = await activeSessions[sessionId].sendStudentAnswer(answer);
        res.json({ reply });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. ADVANCE TOPIC
app.post('/api/advance', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!activeSessions[sessionId]) return res.status(404).json({ error: "Session not found" });
        const reply = await activeSessions[sessionId].advance();
        res.json({ reply });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Render needs the port to be dynamically assigned
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ludus AI Professor is running on port ${PORT}`);
});
