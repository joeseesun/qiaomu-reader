// Adapted from Qiaomu Audio's cloud-service help. These public console links
// are separate from synthesis endpoints and never contain saved credentials.
const links = {
  openai: ['https://platform.openai.com/api-keys', 'https://developers.openai.com/api/docs/guides/text-to-speech'],
  qwen: ['https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key', 'https://help.aliyun.com/zh/model-studio/qwen-tts'],
  doubao: ['https://console.volcengine.com/speech/service', 'https://www.volcengine.com/docs/6561/1598757'],
  minimax: ['https://platform.minimax.cn/console/access?tab=api-keys', 'https://platform.minimax.cn/docs/api-reference/speech-t2a-http'],
  siliconflow: ['https://cloud.siliconflow.cn/account/ak', 'https://docs.siliconflow.cn/docs/userguide/capabilities/text-to-speech'],
  elevenlabs: ['https://elevenlabs.io/app/developers/api-keys', 'https://elevenlabs.io/docs/overview/capabilities/text-to-speech'],
  azure: ['https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices', 'https://learn.microsoft.com/azure/ai-services/speech-service/get-started-text-to-speech'],
};

export function speechServiceLinks(profile) {
  if (profile.id === 'minimax') {
    try {
      if (new URL(profile.baseUrl).hostname === 'api.minimax.io') return [
        'https://platform.minimax.io/console/access?tab=api-keys',
        'https://platform.minimax.io/docs/api-reference/speech-t2a-http',
      ];
    } catch { /* Invalid endpoints keep the default help; synthesis validates. */ }
  }
  return links[profile.id];
}
