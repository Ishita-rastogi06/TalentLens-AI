const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_URL = (configuredApiUrl || "http://127.0.0.1:8000").replace(/\/$/, "");

export async function readApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Backend request failed (${response.status})`);
  }
  return data;
}