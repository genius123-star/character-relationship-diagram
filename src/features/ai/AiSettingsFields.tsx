import type { AiConfiguration } from "./aiClient";

interface AiSettingsFieldsProps {
  configuration: AiConfiguration;
  onChange: (next: AiConfiguration) => void;
  idPrefix: string;
}

/** 密钥仅保存在承载此组件的 React 状态中，关闭面板即丢弃。 */
export function AiSettingsFields({ configuration, onChange, idPrefix }: AiSettingsFieldsProps) {
  const change = (field: keyof AiConfiguration, value: string) => onChange({ ...configuration, [field]: value });
  return <fieldset className="ai-settings">
    <legend>AI 服务设置</legend>
    <label htmlFor={`${idPrefix}-api-key`}>API Key</label>
    <input id={`${idPrefix}-api-key`} type="password" autoComplete="new-password" value={configuration.apiKey} onChange={(event) => change("apiKey", event.target.value)} placeholder="仅当前工作台保存，不写入项目" />
    <label htmlFor={`${idPrefix}-model`}>模型名称</label>
    <input id={`${idPrefix}-model`} value={configuration.model} onChange={(event) => change("model", event.target.value)} placeholder="deepseek-chat" />
    <label htmlFor={`${idPrefix}-base-url`}>Base URL（可选）</label>
    <input id={`${idPrefix}-base-url`} type="url" value={configuration.baseUrl ?? ""} onChange={(event) => change("baseUrl", event.target.value)} placeholder="第三方中转或私有服务时填写，例如 https://host/v1" />
    <p>模型名以 <code>deepseek</code> 开头时默认使用 DeepSeek；其他兼容服务请填写 Base URL。提交文本只会发送给这里指定的服务。</p>
  </fieldset>;
}
