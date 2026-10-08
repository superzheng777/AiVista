/** Shared table types for runtime repositories and image execution services. */
export interface DatabaseSchema { executions: GenerationExecution }
/** Provider input selected from a GENERATION execution. */
export interface GenerationExecution {
  id: string; user_id: string; session_id: string; parent_id: string;
  operation: string; model: string; status: string; revision: number;
  final_prompt: string; final_negative_prompt: string | null;
  width: number; height: number; prompt_extend: boolean;
  requested_image_count: number;
}
