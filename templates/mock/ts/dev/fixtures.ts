export interface MockMessage {
  role: "user" | "char"
  data: string
}

export interface MockChat {
  id: string
  name: string
  message: MockMessage[]
  localLore: unknown[]
  isStreaming: boolean
}

export const character = {
  chaId: "mock-character-1",
  name: "Mock Character",
  type: "character",
  globalLore: [] as unknown[],
}

export const createChat = (): MockChat => ({
  id: "mock-chat-1",
  name: "Mock Chat",
  message: [
    ...Array.from({ length: 6 }, (_, index): MockMessage => ({
      role: index % 2 === 0 ? "user" : "char",
      data: `스토리 메시지 ${index + 1}. 패널이 채팅 위에 떠 있을 때 가려지는 범위를 보기 위한 자리 채움 글.`,
    })),
    { role: "user", data: "주변을 둘러본다." },
    { role: "char", data: "창가로 햇빛이 들어온다. 테이블 위에는 펼쳐진 책과 따뜻한 차 한 잔이 놓여 있다." },
  ],
  localLore: [],
  isStreaming: false,
})

export const argumentsFixture: Record<string, string | number> = {}

export const reply = (message: string): string => `Mock response: ${message || "Continue"}`
