// Agent sample in project demo
/* Initial beliefs and rules */
count(0).
~raining.
busy :- count(N) & N > 3.

{ include("common.asl") }

!start.

@greet[atomic]
+!start : true
    <- .print("hello world.");
       +greeted;
       -+count(1);
       !!loop(_, X).

+!loop(A, B)
    : ready & not busy
    <- while (count(C) & C < 10) {
           .wait(100);
           if (C mod 2 == 0) {
               .print("even ", C);
           } else {
               -count(C);
           }
       }
       ?count(Final);
       my.lib.action(Final, 'quoted atom', 3.14).

+msg(M)[source(Ag)]
    <- .send(Ag, tell, ack(M)).

-!loop(_, _)[error(E)] <- .print("failed: ", E).
