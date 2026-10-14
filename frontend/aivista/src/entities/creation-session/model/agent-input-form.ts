export type AgentInputFormOption = { value: string; label: string };

export type AgentInputFormField =
  | { id: string; type: "TEXT"; label: string; required: boolean; value: string; placeholder?: string }
  | {
      id: string;
      type: "SINGLE_SELECT";
      label: string;
      required: boolean;
      value: string;
      options: AgentInputFormOption[];
      allowCustom: boolean;
      customLabel?: string;
    };

export type AgentInputForm = { schemaVersion: 2; title: string; fields: AgentInputFormField[] };
