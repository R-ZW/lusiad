package com.lusiad.backend.service.project;

import java.sql.Connection;
import java.util.List;

/** All tracking is removed in one transaction, without disabling foreign keys or crossing project ownership. */
final class ProjectRemovalSql {
    private ProjectRemovalSql() {}
    static void checkReferences(Connection c,int id) throws Exception {
        for(String query:List.of(
            "SELECT 1 FROM branches a JOIN branches b ON a.base=b.id WHERE b.project_id=? AND a.project_id<>b.project_id LIMIT 1",
            "SELECT 1 FROM changes a JOIN commits t ON a.commit_id=t.id JOIN branches b ON t.branch_id=b.id WHERE b.project_id=? AND NOT(a.project_id <=> b.project_id) LIMIT 1",
            "SELECT 1 FROM changes a JOIN branches b ON a.branch_id=b.id WHERE b.project_id=? AND NOT(a.project_id <=> b.project_id) LIMIT 1",
            "SELECT 1 FROM commits a JOIN branches x ON a.branch_id=x.id JOIN commits t ON a.prev=t.id OR a.next=t.id OR a.restored_from_commit_id=t.id JOIN branches b ON t.branch_id=b.id WHERE b.project_id=? AND x.project_id<>b.project_id LIMIT 1",
            "SELECT 1 FROM commits a JOIN branches x ON a.branch_id=x.id JOIN changes t ON a.restored_from_change_id=t.id WHERE t.project_id=? AND x.project_id<>t.project_id LIMIT 1",
            "SELECT 1 FROM lusiad_history_tags a JOIN changes t ON a.change_id=t.id WHERE t.project_id=? AND a.project_id<>t.project_id LIMIT 1",
            "SELECT 1 FROM lusiad_history_tags a JOIN commits t ON a.commit_id=t.id JOIN branches b ON t.branch_id=b.id WHERE b.project_id=? AND a.project_id<>b.project_id LIMIT 1",
            "SELECT 1 FROM external_sync_projects a JOIN changes t ON a.pending_bundle_change_id=t.id WHERE t.project_id=? AND a.project_id<>t.project_id LIMIT 1",
            "SELECT 1 FROM commit_change_sets a JOIN changes t ON a.change_id=t.id WHERE t.project_id=? AND a.project_id<>t.project_id LIMIT 1",
            "SELECT 1 FROM commit_change_sets a JOIN branches t ON a.branch_id=t.id WHERE t.project_id=? AND a.project_id<>t.project_id LIMIT 1",
            "SELECT 1 FROM lusiad_edit_operations a JOIN changes t ON a.change_id=t.id WHERE t.project_id=? AND a.project_id<>t.project_id LIMIT 1",
            "SELECT 1 FROM lusiad_git_operations a JOIN commits t ON a.commit_id=t.id JOIN branches b ON t.branch_id=b.id WHERE b.project_id=? AND a.project_id<>b.project_id LIMIT 1"
        )) try(var s=c.prepareStatement(query)) {
            s.setInt(1,id);try(var rows=s.executeQuery()){if(rows.next())throw new ProjectManagementService.Failure("project_cross_reference");}
        }
    }
    static void remove(Connection c,int id) throws Exception {
        checkReferences(c,id);
        for(String sql:List.of(
            "UPDATE commits c JOIN branches b ON c.branch_id=b.id SET c.prev=NULL,c.next=NULL,c.restored_from_commit_id=NULL,c.restored_from_change_id=NULL WHERE b.project_id=?",
            "UPDATE branches SET base=NULL WHERE project_id=?",
            "DELETE FROM lusiad_history_tags WHERE project_id=?",
            "DELETE FROM commit_change_sets WHERE project_id=?",
            "DELETE FROM lusiad_edit_operations WHERE project_id=?",
            "DELETE FROM lusiad_git_operations WHERE project_id=?",
            "DELETE FROM lusiad_sync_operations WHERE project_id=?",
            "DELETE f FROM external_sync_bundle_files f JOIN changes c ON f.change_id=c.id WHERE c.project_id=?",
            "DELETE FROM external_sync_projects WHERE project_id=?",
            "DELETE FROM external_sync_files WHERE project_id=?",
            "DELETE FROM changes WHERE project_id=?",
            "DELETE c FROM commits c JOIN branches b ON c.branch_id=b.id WHERE b.project_id=?",
            "DELETE FROM branches WHERE project_id=?",
            "DELETE FROM projects WHERE id=?"
        )) try(var s=c.prepareStatement(sql)){s.setInt(1,id);s.executeUpdate();}
    }
}
