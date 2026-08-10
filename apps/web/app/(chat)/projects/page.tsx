import ProjectsView from "@/components/projects/ProjectsView";
import { apiServer } from "@/lib/apiServer";

export default async function ProjectsPage() {
    const projects = await apiServer.listProjects().catch(() => []);
    return <ProjectsView initialProjects={projects} />;
}
