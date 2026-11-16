package com.lusiad.toolwindow;
import org.junit.Test;
import java.util.UUID;
import static org.junit.Assert.*;
public class ProjectPresenceTest {
    @Test public void closingOneTabDoesNotCloseAnotherAndLatePingCannotResurrectIt(){
        int project=2147483001;String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString();
        ProjectPresence.heartbeat(project,a,false);ProjectPresence.heartbeat(project,b,false);assertTrue(ProjectPresence.webOpen(project));
        ProjectPresence.heartbeat(project,a,true);assertTrue(ProjectPresence.webOpen(project));ProjectPresence.heartbeat(project,b,true);assertFalse(ProjectPresence.webOpen(project));
        ProjectPresence.heartbeat(project,a,false);assertFalse(ProjectPresence.webOpen(project));
    }
    @Test public void invalidPresenceIsRejected(){
        try{ProjectPresence.heartbeat(0,"invalid",false);fail();}catch(IllegalArgumentException expected){}
    }
}
