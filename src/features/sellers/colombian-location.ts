import catalog from "./colombia-municipalities.json";

export const COLOMBIA_DEPARTMENTS = catalog.departments;

export type ColombianDepartment = (typeof COLOMBIA_DEPARTMENTS)[number];
export type ColombianLocation = {
  department: string;
  municipality: string;
};

export function selectColombianDepartment(department: string) {
  return { department, municipality: "" };
}

function normalizeLocationName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CO");
}

export function resolveColombianLocation(
  department: unknown,
  municipality: unknown,
): ColombianLocation | null {
  if (typeof department !== "string" || typeof municipality !== "string") {
    return null;
  }
  const departmentName = normalizeLocationName(department);
  const municipalityName = normalizeLocationName(municipality);
  const selectedDepartment = COLOMBIA_DEPARTMENTS.find(
    (option) => normalizeLocationName(option.name) === departmentName,
  );
  const selectedMunicipality = selectedDepartment?.municipalities.find(
    (option) => normalizeLocationName(option) === municipalityName,
  );
  return selectedDepartment && selectedMunicipality
    ? {
        department: selectedDepartment.name,
        municipality: selectedMunicipality,
      }
    : null;
}

export function inferColombianLocation(
  municipality: unknown,
  department?: unknown,
): ColombianLocation | null {
  if (typeof municipality !== "string") return null;
  if (typeof department === "string" && department.trim()) {
    return resolveColombianLocation(department, municipality);
  }

  const municipalityName = normalizeLocationName(municipality);
  const matches = COLOMBIA_DEPARTMENTS.flatMap((option) =>
    option.municipalities
      .filter((name) => normalizeLocationName(name) === municipalityName)
      .map((name) => ({ department: option.name, municipality: name })),
  );
  return matches.length === 1 ? matches[0] : null;
}
