export const AGENT_VOICES: Record<string, { voiceId: string; label: string }> = {
  "Paper Collector": { voiceId: "pNInz6obpgDQGcFmaJgB", label: "Adam" },
  "paper-collector": { voiceId: "pNInz6obpgDQGcFmaJgB", label: "Adam" },
  Implementer: { voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Bella" },
  implementer: { voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Bella" },
  "Research Director": { voiceId: "ErXwobaYiN019PkySvjV", label: "Antoni" },
  "research-director": { voiceId: "ErXwobaYiN019PkySvjV", label: "Antoni" },
  system: { voiceId: "VR6AewLTigWG4xSOukaG", label: "Arnold" },
}

export function getVoiceForAgent(
  agent: string,
): { voiceId: string; label: string } {
  const base = agent.replace(/ #\d+$/, "")
  return AGENT_VOICES[base] ?? AGENT_VOICES["system"]
}
