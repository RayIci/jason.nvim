count(0).
busy:-count(N)&N>3.   // rule


+!start:true<-.print("a , b;c");+greeted;!!loop(_,X).
+!loop(A,B)
:ready&not busy
<-while(count(C)&C<10){
.wait(100) ;
}
!g(1) |&| !g(2).   

@l[atomic]+!x <: done <- .print("x:y").   
