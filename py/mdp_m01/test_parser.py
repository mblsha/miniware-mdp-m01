import mdp_m01.parser


def test_skips_completed_packets():
    buf = bytes.fromhex("5A5A030100")
    packets, remaining = mdp_m01.parser.parbuffer(buf)
    assert len(packets) == 0
    assert remaining == bytes.fromhex("030100")
