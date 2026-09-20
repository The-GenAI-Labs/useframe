"use client";

import { useEffect, useState } from "react";
import ProjectsView from "@/components/projects/ProjectsView";
import { projectsApi, type ProjectListItem } from "@/lib/api/services/projects.service";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function ProjectsPage() {
    const [projects, setProjects] = useState<ProjectListItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        projectsApi
            .list()
            .then((data) => {
                if (!cancelled) setProjects(data);
            })
            .catch(() => {
                if (!cancelled) setProjects([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) return null;

    return (
        <PageFadeIn>
            <ProjectsView initialProjects={projects} />
        </PageFadeIn>
    );
}
