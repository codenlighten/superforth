;; Super-Forth WAT generated module
(module
  (memory (export "mem") 1)
  (global $sp (mut i32) (i32.const 0))
  (func $push (param $v i32)
    global.get $sp
    i32.const 4
    i32.mul
    local.get $v
    i32.store
    global.get $sp
    i32.const 1
    i32.add
    global.set $sp
  )
  (func $pop (result i32)
    (local $idx i32)
    global.get $sp
    i32.const 1
    i32.sub
    local.set $idx
    local.get $idx
    i32.const 4
    i32.mul
    i32.load
    local.get $idx
    global.set $sp
  )
  (func $peek (result i32)
    global.get $sp
    i32.const 1
    i32.sub
    i32.const 4
    i32.mul
    i32.load
  )
  (func $peek2 (result i32)
    global.get $sp
    i32.const 2
    i32.sub
    i32.const 4
    i32.mul
    i32.load
  )
  (func $main (param $p0 i32) (param $p1 i32) (result i32)
    (local $t0 i32)
    (local $t1 i32)
    ;; init stack with params in order
    local.get $p0
    call $push
    local.get $p1
    call $push
    call $peek
    call $push
    call $pop
    local.set $t0
    call $pop
    local.set $t1
    local.get $t1
    local.get $t0
    i32.mul
    call $push
    call $pop
    local.set $t0
    call $pop
    local.set $t1
    local.get $t0
    call $push
    local.get $t1
    call $push
    call $peek
    call $push
    call $pop
    local.set $t0
    call $pop
    local.set $t1
    local.get $t1
    local.get $t0
    i32.mul
    call $push
    call $pop
    local.set $t0
    call $pop
    local.set $t1
    local.get $t1
    local.get $t0
    i32.add
    call $push
    call $peek
    call $push
    i32.const 100
    call $push
    call $pop
    local.set $t0
    call $pop
    local.set $t1
    local.get $t1
    local.get $t0
    i32.gt_s
    call $push
    call $pop
    (if
      (then
    call $pop
    drop
    i32.const 100
    call $push
      )
      (else
      )
    )
    ;; return top of stack
    call $pop
  )
  (export "main" (func $main))
)