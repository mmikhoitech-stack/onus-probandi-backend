/**
 * UNIVERSAL LUDUS LECTURER ENGINE - VERSION 5.0
 * Includes: LOC262 (Contract), LAC262 (Customary Law), LDE152 (Leadership & Ethics)
 * Style: Human-like classroom lecturer, clear explanations, strict IRAC.
 */

const LUDUS_CONFIG = {
  API_KEY: process.env.LUDUS_API_KEY || "YOUR_API_KEY_HERE",
  API_ENDPOINT: process.env.LUDUS_ENDPOINT || "https://api.openai.com/v1/chat/completions",
  MODEL: process.env.LUDUS_MODEL || "gpt-4o",
  MAX_RETRIES: 2,
  TEMPERATURE: 0.3,
};

// --- THE FIXED DISCIPLINE LAYER (HOW THE AI BEHAVES) ---
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

// --- MATERIAL 1: LOC262 (LAW OF CONTRACT) ---
const LOC262_MATERIAL = {
  id: "LOC262",
  name: "Law of Contract",
  persona: "South African LLB Law Professor specializing in the Law of Contract.",
  jurisdiction: "South African common law, Consumer Protection Act 68 of 2008, Constitution s39(2).",
  doctrines: ["Parol Evidence Rule", "Shifren Principle", "Ex Turpi Causa", "Par Delictum", "Exceptio non adimpleti contractus (ENAC)"],
  caseLaw: ["Sonap Petroleum", "Beadica 231 CC", "Bloom v American Swiss Watch Co", "Jajbhay v Cassim", "Datacolor", "Endumeni"],
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
      title: "CONSENSUS (OFFER AND ACCEPTANCE)",
      definition: "Offer must be firm, complete, and communicated. Acceptance must be unqualified.",
      explanation: "Ads are invitations to do business. Rewards are offers to the public. If you don't know about the reward, you can't claim it. Postal contracts use the Expedition Theory (formed when posted). Electronic contracts use the Reception Theory.",
      cases: "Bloom v American Swiss Watch Co",
      task: "Sipho returns a lost dog before seeing the reward poster. He later sees it and claims the reward. Identify the ISSUE. State the RULE. APPLY. Give the CONCLUSION. Wait for my critique."
    },
    {
      id: 3,
      title: "IMPROPERLY OBTAINED CONSENSUS AND MISTAKE",
      definition: "Duress, Undue Influence, Commercial Bribery (all valid but voidable). Common Mistake (void). Error in Corpore (void). Iustus Error (material and reasonable).",
      explanation: "Undue influence happens when someone abuses a relationship of trust to weaken your will. Duress is a threat. Commercial bribery is bribing an agent.",
      cases: "Extel Industrial v Crown Mills",
      task: "Peter is under severe strain. His therapist convinces him to sell his car for half its market value. Identify the ISSUE. State the RULE for undue influence. APPLY. Give the CONCLUSION. Wait for my critique."
    },
    {
      id: 4,
      title: "FORMALITIES AND ILLEGALITY",
      definition: "Alienation of Land Act (writing). Suretyship (writing). Shifren Principle (no oral variation). Caveat Subscriptor.",
      explanation: "Ex Turpi Causa means no action arises from a dishonourable cause. Par Delictum means equal guilt, so the court leaves them where they are. Jajbhay v Cassim allows an exception if simple justice demands it, but not for morally reprehensible conduct.",
      cases: "Shifren, Jajbhay v Cassim",
      task: "X pays Y R50,000 to kill X's mother-in-law. Y doesn't do it. X wants his money back. Identify the ISSUE. State the RULES of Ex Turpi Causa and Par Delictum. APPLY Jajbhay. Argue the counter-argument first. Give the CONCLUSION. Wait."
    },
    {
      id: 5,
      title: "BREACH AND REMEDIES",
      definition: "Mora Debitoris, Mora Creditoris, Positive Malperformance, Repudiation, Prevention of Performance.",
      explanation: "Remedies include ENAC (withhold performance if the other side breached), Specific Performance, Cancellation (only for material breach), and Damages.",
      cases: "Datacolor",
      task: "XYZ prints T-shirts in normal ink instead of neon. Mr A refuses to pay. Identify the breach. Identify the defence (ENAC). State the requirements. APPLY. Give the CONCLUSION. Wait."
    },
    {
      id: 6,
      title: "INTERPRETATION AND CPA",
      definition: "Endumeni Rule (objective, language, context, purpose). Parol Evidence Rule (no extrinsic evidence).",
      explanation: "The CPA protects consumers against inequality of bargaining power. You can cancel fixed-term agreements with 20 business days notice.",
      cases: "Endumeni",
      task: "A consumer is trapped in an unfair fixed-term cellphone contract. Using s39(2) and the CPA, argue how the CPA overrides pacta sunt servanda. Use IRAC. Wait."
    }
  ],
  scenarios: {
    hitman: "X pays Y to kill his mother-in-law.",
    postal: "Supersave posted the acceptance letter in Bloemfontein on 15 May.",
    reward: "Sipho returns a lost dog before seeing the reward poster.",
    shifren: "Landlord orally reduces rent despite a non-variation clause."
  }
};

// --- MATERIAL 2: LAC262 (AFRICAN CUSTOMARY LAW) ---
const LAC262_MATERIAL = {
  id: "LAC262",
  name: "African Customary Law",
  persona: "South African LLB Law Professor specializing in African Customary Law (LAC262).",
  jurisdiction: "South African customary law, RCMA, Law of Evidence Amendment Act, Constitution of 1996.",
  doctrines: ["Living vs Official Customary Law", "Deep vs Weak Legal Pluralism", "Mafisa Contract", "RCMA Requirements", "Restorative Justice"],
  caseLaw: ["Bhe v Khayelitsha Magistrate", "Shilubana v Nwamitwa", "Gumede v President", "Mayelane v Ngwenyama", "Mogale v Speaker"],
  topics: [
    {
      id: 1,
      title: "NATURE OF CUSTOMARY LAW & LEGAL PLURALISM",
      definition: "Living customary law is the actual, unwritten practices of communities. Official customary law is the rigid, written version applied by colonial courts.",
      explanation: "Think of Deep Legal Pluralism as multiple legal systems coexisting independently. The repugnancy clause was historically used to strike down customary rules that offended Western public policy.",
      cases: "Bhe v Khayelitsha Magistrate",
      task: "Evaluate the following statement: 'Deep legal pluralism describes a situation where the state officially recognises and regulates all existing legal systems within its borders.' Is this TRUE or FALSE? Explain your answer. Wait for my critique."
    },
    {
      id: 2,
      title: "CAPACITY TO CONTRACT & MAFISA",
      definition: "Historically, only male family heads had full capacity. Today, all majors (18+) have capacity. Mafisa is a livestock loan agreement where ownership remains with the depositor.",
      explanation: "In a mafisa contract, the borrower gets the milk and ploughing power, but the ownership stays with the original owner. If the animal dies naturally in a storm, the owner bears the loss.",
      cases: "None specific.",
      task: "Sipho enters into a mafisa contract with David, giving him three cows. One dies in a storm, and David sells another to Peter (an innocent third party). Advise Sipho on his legal rights to reclaim the cows. Use IRAC. Wait for my critique."
    },
    {
      id: 3,
      title: "DISSOLUTION OF CUSTOMARY MARRIAGE",
      definition: "Under Section 8(1) of the RCMA, a customary marriage can ONLY be dissolved by a court of law issuing a decree of divorce based on the irretrievable breakdown of the marriage.",
      explanation: "A family council cannot dissolve a marriage. Traditional reasons like witchcraft or infertility are just evidence for the court; they are not the legal ground.",
      cases: "RCMA s8(1)",
      task: "Name and explain the SOLE legal ground for dissolving a customary marriage under the RCMA. Then explain the difference between this legal ground and traditional reasons for divorce. Provide at least four examples of traditional reasons. Wait for my critique."
    },
    {
      id: 4,
      title: "REQUIREMENTS FOR A VALID CUSTOMARY MARRIAGE",
      definition: "Pre-RCMA: Consent of spouses, consent of family heads, lobolo, handing over of the bride. Post-RCMA (Section 3(1)): Both over 18, free consent, negotiated per custom.",
      explanation: "The RCMA formalized the requirements. Failure to register does not invalidate the marriage. Spousal consent and the bride's age are strictly protected.",
      cases: "Mayelane v Ngwenyama",
      task: "Write an essay comparing and contrasting the requirements for a valid customary marriage before the RCMA came into force with the requirements after the RCMA came into force. (Focus on spousal consent and the handing over of the bride). Wait for my critique."
    }
  ],
  scenarios: {
    mafisa: "Sipho enters into a mafisa contract with David (3 cows). One dies in a storm, David sells another to Peter.",
    trueFalse: "Evaluate: Official customary law refers to the law as it is actually lived and practised by communities today.",
    dissolution: "A family council attempts to dissolve a marriage by demanding lobolo back. Advise the wife.",
    rcmaEssay: "Compare the pre-RCMA and post-RCMA requirements for a valid customary marriage."
  }
};

// --- MATERIAL 3: LDE152 / LDE252 (LEADERSHIP AND ETHICS) ---
const LDE152_MATERIAL = {
  id: "LDE152",
  name: "Leadership and Ethics",
  persona: "South African Professor specializing in Leadership and Ethics (LDE152/LDE252).",
  jurisdiction: "Leadership theories, Bar-On Emotional Intelligence, Kotter's Change Model, Ubuntu philosophy.",
  doctrines: ["Authentic Leadership", "Transactional vs Transformational Leadership", "Servant Leadership", "Multicultural Leadership", "Emotional Intelligence (Bar-On)"],
  caseLaw: ["Van Zyl et al. (2022) - Team Leadership Principles", "John Kotter - Change Model", "Greenleaf - Servant Leadership"],
  topics: [
    {
      id: 1,
      title: "LEADERSHIP STYLES (AUTHENTIC, TRANSACTIONAL, TRANSFORMATIONAL)",
      definition: "Authentic leadership is grounded in self-awareness and transparency. Transformational leadership inspires followers to achieve extraordinary outcomes. Transactional leadership relies on structure, rewards, and punishments.",
      explanation: "Transformational leaders rely on inspiration, not just positional authority. Transactional leaders are best for stability and routine, not rapid change.",
      cases: "None specific.",
      task: "Compare the leadership approaches of Donald Trump and Cyril Ramaphosa. Evaluate this statement: 'Ramaphosa's emphasis on consultation and consensus aligns more closely with transactional leadership than with transformational leadership.' Is it TRUE or FALSE? Explain. Wait for my critique."
    },
    {
      id: 2,
      title: "EMOTIONAL INTELLIGENCE (BAR-ON MODEL)",
      definition: "Bar-On's model consists of 5 building blocks: Intrapersonal, Interpersonal, Adaptability, Stress Management, and General Mood.",
      explanation: "Leadership principles like Empathy, Humility, and Integrity map to these blocks. Ethical dilemmas involve conflicting values and uncertain outcomes, requiring high EQ.",
      cases: "None specific.",
      task: "Select the THREE most appropriate leadership principles from Bar-On's model that you consider essential for managing a diverse workplace. State the emotional intelligence building blocks supporting each, and explain practical ways to develop them. Wait for my critique."
    },
    {
      id: 3,
      title: "TEAM LEADERSHIP & MULTICULTURALISM",
      definition: "Effective team leadership involves setting clear roles and expectations. A multicultural leader recognises and leverages diverse strengths rather than enforcing conformity.",
      explanation: "Feminist leadership theory highlights inclusivity and empowerment. African leadership models (Ubuntu) emphasise collective welfare over individual ambition.",
      cases: "Van Zyl et al. (2022)",
      task: "Imagine you are the president of a democratic country. Drawing on the team leadership principles identified by Van Zyl et al. (2022), outline practical actions you would implement to ensure a diverse governmental team achieves its objectives. Use the keywords. Wait for my critique."
    },
    {
      id: 4,
      title: "ORGANISATIONAL CHANGE (KOTTER'S MODEL)",
      definition: "John Kotter's model for successful change management involves practical steps to guide a company through transformation.",
      explanation: "Steps include creating urgency, forming a coalition, creating a vision, communicating the vision, removing obstacles, creating short-term wins, building on the change, and anchoring it in culture.",
      cases: "John Kotter",
      task: "Imagine you are advising a newly appointed CEO who must urgently implement significant changes to save a struggling company. Describe the practical steps you would recommend based on Kotter's insights. Use the keywords from Kotter's model. Wait for my critique."
    }
  ],
  scenarios: {
    trumpVsRamaphosa: "Evaluate the comparative leadership styles of Donald Trump (charismatic, coercive) and Cyril Ramaphosa (consultation, soft power, servant leadership).",
    kotterChange: "A newly appointed CEO needs to urgently implement significant changes to save a struggling company.",
    vanZylTeam: "The president of a democratic country is leading a diverse governmental team facing critical challenges.",
    barOnPrinciples: "Select the 3 most essential leadership principles from Bar-On's model for managing a diverse and challenging workplace."
  }
};

// --- THE ENGINE LOGIC ---
function validateResponse(text, material) {
  const violations = [];
  if (text.includes("*")) violations.push("MARKDOWN ASTERISKS DETECTED. Remove all asterisks.");
  const hasCapsHeading = /^[A-Z0-9 ,.'\-()]{5,}$/m.test(text);
  if (!hasCapsHeading) violations.push("NO ALL CAPS HEADING DETECTED. Add a heading in capitals.");
  const endsWithTask = /(YOUR TASK|WAIT FOR MY CRITIQUE|IDENTIFY THE ISSUE|ANSWER ME|WHAT IS THE ISSUE)/i.test(text);
  if (!endsWithTask) violations.push("RESPONSE DOES NOT END WITH A TASK. Give the student a task and wait.");
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
Prescribed IRAC task: ${topic.task}

SCENARIO BANK: ${Object.entries(m.scenarios).map(([k, v]) => `${k}: ${v}`).join(" | ")}`;
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

  async requestScenario(scenarioName) {
    const scenario = this.material.scenarios[scenarioName];
    if (!scenario) return `SCENARIO NOT FOUND. Available: ${Object.keys(this.material.scenarios).join(", ")}`;
    return this.callAI(`Give me this scenario as an IRAC task: ${scenario}. Ask for the ISSUE first. Wait for my critique.`);
  }
}

// --- BOOTSTRAP & USAGE ---
const engine = new LecturerEngine();
engine.registerMaterial(LOC262_MATERIAL);
engine.registerMaterial(LAC262_MATERIAL);
engine.registerMaterial(LDE152_MATERIAL);

// To test, uncomment the lines below:
// async function test() {
//   const lecturer = engine.createSession("LDE152");
//   console.log(await lecturer.start());
// }
// test();
