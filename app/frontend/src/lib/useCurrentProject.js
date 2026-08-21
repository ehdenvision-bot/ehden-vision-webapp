import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";

// Mirrors the legacy app's projectId-in-context pattern (URL param ->
// localStorage fallback), since there's no dedicated single-project
// fetch endpoint — matches gsListProjects being the only project read call.
export function useCurrentProject() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("projectId") || localStorage.getItem("currentProjectId") || "";

  useEffect(() => {
    if (params.get("projectId")) localStorage.setItem("currentProjectId", params.get("projectId"));
  }, [params]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api("/projects"),
  });

  const project = projects.find((p) => p.id === projectId) || null;

  function setProjectId(id) {
    setParams({ projectId: id });
  }

  return { projectId, project, projects, isLoading, setProjectId };
}
