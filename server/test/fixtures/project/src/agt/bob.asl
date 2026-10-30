{ include("common.asl") }

count(0).
ready :- count(N) & N >= 0.

!start.

@start[atomic]
+!start : ready
    <- !greet(alice);
       ?count(C);
       -+count(C + 1);
       lib.act(C);
       .send(alice, tell, hi);
       !work(X).

+!work(Y) <- .print(Y). {
    +!sub <- true.
}

{ begin namespace(inner, local) }
flag(on).
{ end }
