"use client";
import { useState } from "react";
import { Check, MapPin, Palette, RotateCcw } from "lucide-react";
import {
  ENVIRONMENTS,
  createEnvironment,
  type Environment,
  type SceneVersion,
} from "@tre/scene-format";

export function LocationPanel({
  scene,
  onApply,
  busy,
}: {
  scene: SceneVersion;
  onApply: (name: string, environment: Environment) => void;
  busy: boolean;
}) {
  const [environment, setEnvironment] = useState(scene.environment),
    [name, setName] = useState(scene.name);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(
          name.trim() || ENVIRONMENTS[environment.preset].name,
          environment,
        );
      }}
    >
      <p className="modal-intro">
        Giv fortællingen et sted at begynde. Vælg et set, og tilpas farverne.
        Dine karakterer og kameraer bliver på deres pladser.
      </p>
      <div className="location-presets" role="group" aria-label="Vælg set">
        {(Object.keys(ENVIRONMENTS) as Environment["preset"][]).map(
          (preset) => (
            <button
              type="button"
              key={preset}
              className={`location-preset ${environment.preset === preset ? "selected" : ""}`}
              aria-pressed={environment.preset === preset}
              onClick={() => {
                setEnvironment(createEnvironment(preset));
                setName(ENVIRONMENTS[preset].name);
              }}
            >
              <img
                src={`/locations/${preset}.jpg`}
                alt=""
                width={480}
                height={270}
              />
              <span className="location-preset-label">
                <strong>{ENVIRONMENTS[preset].name}</strong>
                {environment.preset === preset && <Check size={15} />}
              </span>
              <span className="location-preset-description">
                {ENVIRONMENTS[preset].description}
              </span>
            </button>
          ),
        )}
      </div>
      <label className="field location-name">
        <span>Navn på dit set</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
        />
      </label>
      <div className="location-palette-heading">
        <span>
          <Palette size={14} /> FARVER I DIT SET
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => setEnvironment(createEnvironment(environment.preset))}
        >
          <RotateCcw size={12} /> Nulstil farver
        </button>
      </div>
      <div className="location-colors">
        <label>
          <input
            type="color"
            value={environment.groundColor}
            aria-label="Gulvets farve"
            onChange={(event) =>
              setEnvironment({
                ...environment,
                groundColor: event.target.value,
              })
            }
          />
          <span>
            Gulv og flader<small>{environment.groundColor.toUpperCase()}</small>
          </span>
        </label>
        <label>
          <input
            type="color"
            value={environment.skyColor}
            aria-label="Himlens farve"
            onChange={(event) =>
              setEnvironment({ ...environment, skyColor: event.target.value })
            }
          />
          <span>
            Himmel og baggrund
            <small>{environment.skyColor.toUpperCase()}</small>
          </span>
        </label>
      </div>
      <button className="button primary full-width" disabled={busy}>
        <MapPin size={15} /> Brug dette set
      </button>
      <p className="modal-footnote">
        Ændringen gemmes i arbejdsscenen. Åbn kontinuitet for at vælge, hvilke
        kamerashots der skal opdateres. Tidligere sceneversioner bevares.
      </p>
    </form>
  );
}
