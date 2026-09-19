package com.superz.aivista.generation.message;

/** Authoritative task phase after an idempotent worker report. */
public record GenerationPhaseResponse(String generationTaskId, String status, int revision) {
}
